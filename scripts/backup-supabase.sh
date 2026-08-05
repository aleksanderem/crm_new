#!/usr/bin/env bash
# Backup self-hosted Supabase Postgres: pg_dump → gzip → AES-256-CBC → S3 upload.
# Designed to run unattended (cron / GitHub Actions).
#
# Required env vars:
#   SUPABASE_DB_URL          PostgreSQL connection string
#                            (e.g. postgresql://postgres:pass@db.example.com:5433/postgres)
#   BACKUP_ENCRYPTION_KEY    Passphrase for AES-256-CBC encryption
#   BACKUP_S3_BUCKET         Destination bucket name, no s3:// prefix (e.g. my-backups)
#   AWS_ACCESS_KEY_ID        S3 credentials
#   AWS_SECRET_ACCESS_KEY    S3 credentials
#
# Optional env vars:
#   BACKUP_S3_PREFIX         Path prefix inside the bucket (default: supabase-backups)
#   AWS_DEFAULT_REGION       S3 region (default: us-east-1)
#   AWS_ENDPOINT_URL         Override endpoint for S3-compatible stores (Backblaze B2, MinIO…)
#   BACKUP_RETENTION_DAYS    Delete backups older than N days (default: 30)

set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"

BACKUP_S3_PREFIX="${BACKUP_S3_PREFIX:-supabase-backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_FILE="backup-${TIMESTAMP}.sql.gz.enc"

WORK_DIR="$(mktemp -d)"
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

echo "[backup] Starting at ${TIMESTAMP}"

# ── 1. Dump database ────────────────────────────────────────────────────────
echo "[backup] Dumping database..."
pg_dump "${SUPABASE_DB_URL}" \
  --no-owner \
  --no-acl \
  --format=plain \
  | gzip > "${WORK_DIR}/dump.sql.gz"

DUMP_SIZE=$(du -sh "${WORK_DIR}/dump.sql.gz" | cut -f1)
echo "[backup] Dump complete (${DUMP_SIZE} compressed)"

# ── 2. Encrypt (AES-256-CBC + PBKDF2, 200 000 iterations) ──────────────────
echo "[backup] Encrypting..."
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass "env:BACKUP_ENCRYPTION_KEY" \
  -in  "${WORK_DIR}/dump.sql.gz" \
  -out "${WORK_DIR}/${BACKUP_FILE}"

rm -f "${WORK_DIR}/dump.sql.gz"

# ── 3. Upload to S3-compatible storage ──────────────────────────────────────
S3_KEY="${BACKUP_S3_PREFIX}/${BACKUP_FILE}"

AWS_EXTRA=()
[ -n "${AWS_ENDPOINT_URL:-}" ] && AWS_EXTRA=(--endpoint-url "${AWS_ENDPOINT_URL}")

echo "[backup] Uploading to s3://${BACKUP_S3_BUCKET}/${S3_KEY}..."
aws s3 cp "${AWS_EXTRA[@]}" \
  "${WORK_DIR}/${BACKUP_FILE}" \
  "s3://${BACKUP_S3_BUCKET}/${S3_KEY}" \
  --region "${AWS_DEFAULT_REGION}" \
  --no-progress

echo "[backup] Upload complete"

# ── 4. Retention — delete objects older than BACKUP_RETENTION_DAYS ──────────
echo "[backup] Applying ${BACKUP_RETENTION_DAYS}-day retention..."

# GNU date (Linux) vs BSD date (macOS)
if date --version >/dev/null 2>&1; then
  CUTOFF=$(date -u -d "${BACKUP_RETENTION_DAYS} days ago" +"%Y-%m-%dT%H:%M:%SZ")
else
  CUTOFF=$(date -u -v "-${BACKUP_RETENTION_DAYS}d" +"%Y-%m-%dT%H:%M:%SZ")
fi

aws s3api "${AWS_EXTRA[@]}" list-objects-v2 \
  --bucket "${BACKUP_S3_BUCKET}" \
  --prefix "${BACKUP_S3_PREFIX}/" \
  --region "${AWS_DEFAULT_REGION}" \
  --query "Contents[?LastModified<='${CUTOFF}'].Key" \
  --output text 2>/dev/null \
| tr '\t' '\n' \
| grep -v '^$' \
| grep -v '^None$' \
| while IFS= read -r key; do
    aws s3api "${AWS_EXTRA[@]}" delete-object \
      --bucket "${BACKUP_S3_BUCKET}" \
      --key "$key" \
      --region "${AWS_DEFAULT_REGION}" > /dev/null
    echo "[backup] Purged old backup: ${key}"
  done

echo "[backup] Done."
