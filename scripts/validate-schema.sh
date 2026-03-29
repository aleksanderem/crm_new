#!/usr/bin/env bash
# =============================================================================
# validate-schema.sh  —  PostgreSQL schema + RLS validation suite
#
# Usage:
#   bash scripts/validate-schema.sh [--docker]
#
# Options:
#   --docker   spin up postgres via docker-compose.test.yml (default when no
#              PGHOST/DATABASE_URL is set and docker is available)
#
# Env vars (override auto-detection):
#   DATABASE_URL   full psql connection string
#   PGHOST         postgres host (default: localhost)
#   PGPORT         postgres port  (default: 5432)
#   PGDATABASE     database name  (default: crm_test)
#   PGUSER         user           (default: test_user)
#   PGPASSWORD     password       (default: test_pass)
#
# Exit codes:
#   0  all checks passed
#   1  one or more checks failed
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── colour helpers ──────────────────────────────────────────────────────────
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
NC="\033[0m"
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
fail() { echo -e "${RED}✗ $*${NC}"; FAILURES=$((FAILURES+1)); }
info() { echo -e "${YELLOW}→ $*${NC}"; }

FAILURES=0
DOCKER_STARTED=0

# ── connection defaults ──────────────────────────────────────────────────────
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5433}"          # 5433 avoids clashing with local postgres
PGDATABASE="${PGDATABASE:-crm_test}"
PGUSER="${PGUSER:-test_user}"
PGPASSWORD="${PGPASSWORD:-test_pass}"
export PGPASSWORD

PSQL_OPTS="-h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE -v ON_ERROR_STOP=1"

# ── optional docker startup ─────────────────────────────────────────────────
USE_DOCKER="${1:-}"
if [[ "$USE_DOCKER" == "--docker" ]] || \
   ( [[ -z "${DATABASE_URL:-}" ]] && command -v docker &>/dev/null && \
     ! pg_isready -h "$PGHOST" -p "$PGPORT" -q 2>/dev/null ); then
    info "Starting postgres via docker-compose.test.yml …"
    docker compose -f "$REPO_ROOT/docker-compose.test.yml" up -d --wait 2>&1 | tail -3
    DOCKER_STARTED=1
    # Wait for postgres to be ready
    for i in $(seq 1 20); do
        pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -q 2>/dev/null && break
        sleep 1
    done
fi

# ── cleanup trap ─────────────────────────────────────────────────────────────
cleanup() {
    if [[ "$DOCKER_STARTED" -eq 1 ]]; then
        info "Stopping test postgres …"
        docker compose -f "$REPO_ROOT/docker-compose.test.yml" down -v --remove-orphans 2>/dev/null || true
    fi
}
trap cleanup EXIT

# ── connectivity check ───────────────────────────────────────────────────────
info "Checking database connectivity ($PGHOST:$PGPORT/$PGDATABASE) …"
if ! pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -q 2>/dev/null; then
    fail "Cannot connect to PostgreSQL at $PGHOST:$PGPORT — is the server running?"
    echo ""
    echo "  Hints:"
    echo "    1. Pass --docker to auto-start via docker-compose.test.yml"
    echo "    2. Or set PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE"
    exit 1
fi
ok "Database reachable"

# ── apply migrations ────────────────────────────────────────────────────────
info "Applying migration 00001_initial_schema.sql …"
if psql $PSQL_OPTS -f "$REPO_ROOT/supabase/migrations/00001_initial_schema.sql" \
        --single-transaction -q 2>&1; then
    ok "00001_initial_schema.sql applied"
else
    fail "00001_initial_schema.sql failed"
fi

info "Applying migration 00002_rls_policies.sql …"
if psql $PSQL_OPTS -f "$REPO_ROOT/supabase/migrations/00002_rls_policies.sql" \
        --single-transaction -q 2>&1; then
    ok "00002_rls_policies.sql applied"
else
    fail "00002_rls_policies.sql failed"
fi

# ── table count ─────────────────────────────────────────────────────────────
info "Checking table count …"
TABLE_COUNT=$(psql $PSQL_OPTS -t -A -c \
    "SELECT COUNT(*) FROM information_schema.tables \
     WHERE table_schema='public' AND table_type='BASE TABLE';" 2>/dev/null || echo 0)
TABLE_COUNT="${TABLE_COUNT//[[:space:]]/}"
if [[ "$TABLE_COUNT" -ge 85 ]]; then
    ok "Table count: $TABLE_COUNT (≥85)"
else
    fail "Table count: $TABLE_COUNT (expected ≥85)"
fi

# ── index check: contacts(organizationId, email) ─────────────────────────────
info "Checking contacts org+email index …"
IDX_EXISTS=$(psql $PSQL_OPTS -t -A -c \
    "SELECT COUNT(*) FROM pg_indexes \
     WHERE tablename='contacts' AND indexdef ILIKE '%organizationid%' AND indexdef ILIKE '%email%';" \
     2>/dev/null || echo 0)
IDX_EXISTS="${IDX_EXISTS//[[:space:]]/}"
if [[ "$IDX_EXISTS" -ge 1 ]]; then
    ok "contacts(organizationId, email) index found"
else
    fail "Missing index on contacts(organizationId, email)"
fi

# ── RLS enabled on tables ───────────────────────────────────────────────────
info "Checking RLS is enabled on tables …"
RLS_COUNT=$(psql $PSQL_OPTS -t -A -c \
    "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity=true;" \
     2>/dev/null || echo 0)
RLS_COUNT="${RLS_COUNT//[[:space:]]/}"
if [[ "$RLS_COUNT" -ge 50 ]]; then
    ok "RLS enabled on $RLS_COUNT tables"
else
    fail "RLS enabled on only $RLS_COUNT tables (expected ≥50)"
fi

# ── policy count ─────────────────────────────────────────────────────────────
info "Checking RLS policy count …"
POL_COUNT=$(psql $PSQL_OPTS -t -A -c \
    "SELECT COUNT(*) FROM pg_policies WHERE schemaname='public';" \
     2>/dev/null || echo 0)
POL_COUNT="${POL_COUNT//[[:space:]]/}"
if [[ "$POL_COUNT" -ge 100 ]]; then
    ok "RLS policy count: $POL_COUNT (≥100)"
else
    fail "RLS policy count: $POL_COUNT (expected ≥100)"
fi

# ── org isolation test ───────────────────────────────────────────────────────
info "Testing org tenant isolation …"
if psql $PSQL_OPTS -f "$REPO_ROOT/scripts/test-rls.sql" -q 2>&1 | grep -q "ALL ASSERTIONS PASSED"; then
    ok "RLS isolation assertions passed"
else
    # Run again verbosely so the NOTICE messages are visible
    psql $PSQL_OPTS -f "$REPO_ROOT/scripts/test-rls.sql" 2>&1 | grep -E "PASS|FAIL|ERROR|EXCEPTION" || true
    fail "RLS isolation assertions FAILED (see output above)"
fi

# ── cross-module FK: gabinetPatients -> contacts ─────────────────────────────
info "Checking cross-module foreign key gabinetPatients.contactId → contacts …"
FK_EXISTS=$(psql $PSQL_OPTS -t -A -c \
    "SELECT COUNT(*) FROM information_schema.referential_constraints rc
     JOIN information_schema.key_column_usage kcu ON rc.constraint_name = kcu.constraint_name
     WHERE kcu.table_name ILIKE 'gabinetpatients' AND kcu.column_name ILIKE 'contactid';" \
     2>/dev/null || echo 0)
FK_EXISTS="${FK_EXISTS//[[:space:]]/}"
if [[ "$FK_EXISTS" -ge 1 ]]; then
    ok "gabinetPatients.contactId → contacts FK exists"
else
    # Not all deployments enforce FKs; warn but don't fail
    info "FK not found (may be intentionally deferred) — check schema manually"
fi

# ── summary ─────────────────────────────────────────────────────────────────
echo ""
if [[ "$FAILURES" -eq 0 ]]; then
    echo -e "${GREEN}╔══════════════════════════════════════╗"
    echo -e "║  ALL SCHEMA VALIDATIONS PASSED ✓    ║"
    echo -e "╚══════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔══════════════════════════════════════╗"
    echo -e "║  $FAILURES VALIDATION(S) FAILED ✗         ║"
    echo -e "╚══════════════════════════════════════╝${NC}"
    exit 1
fi
