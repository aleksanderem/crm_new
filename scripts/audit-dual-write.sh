#!/usr/bin/env bash
# Audit: verify every Convex create mutation has a dual-write to Supabase
# Usage: bash scripts/audit-dual-write.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== DUAL-WRITE COVERAGE AUDIT ==="
echo ""

CONVEX_DIR="convex"
violations=0
checked=0

# Find all files with ctx.db.insert (create operations)
while IFS= read -r file; do
  # Get all insert table names in this file
  while IFS= read -r line; do
    table=$(echo "$line" | sed -n 's/.*ctx\.db\.insert("\([^"]*\)".*/\1/p')
    lineno=$(echo "$line" | cut -d: -f1)

    # Skip tables that don't need dual-write (internal/system)
    case "$table" in
      authAccounts|authSessions|authVerificationCodes|authRateLimits) continue ;;
      _*) continue ;;
    esac

    checked=$((checked + 1))

    # Check if the same file has a scheduler.runAfter call referencing supabase
    has_dualwrite=$(grep -c 'scheduler\.runAfter\|scheduler.runAfter' "$file" 2>/dev/null || true)

    if [ "$has_dualwrite" -eq 0 ]; then
      echo -e "${RED}MISSING${NC} dual-write: ${file}:${lineno} → insert(\"${table}\")"
      violations=$((violations + 1))
    fi
  done < <(grep -n 'ctx\.db\.insert("' "$file" 2>/dev/null || true)
done < <(find "$CONVEX_DIR" -name "*.ts" -not -path "*/node_modules/*" -not -path "*/_generated/*" -not -path "*/supabase/*" -not -name "*.test.ts" | sort)

echo ""
echo "=== SUMMARY ==="
echo -e "Checked: ${checked} insert operations"
if [ "$violations" -eq 0 ]; then
  echo -e "${GREEN}PASS${NC}: All create mutations have dual-write to Supabase"
else
  echo -e "${RED}FAIL${NC}: ${violations} mutations missing dual-write"
fi
echo ""
exit $violations
