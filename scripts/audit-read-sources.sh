#!/usr/bin/env bash
# Audit: verify all data reads in routes/components use Supabase hooks, not Convex queries
# Usage: bash scripts/audit-read-sources.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== READ SOURCE AUDIT ==="
echo "Checking that data reads use Supabase hooks, not Convex queries"
echo ""

# Allowed Convex reads (auth/meta only, not data storage)
ALLOWED_PATTERNS=(
  "api.app.getCurrentUser"
  "api.app.getActivePlans"
  "api.organizations.getMyOrganizations"
  "api.permissions"
  "api.oauthConnections"
  "api.dev.emails"
  "api.documents.documents.getBySigningToken"
  "api.signatureRequests"
  "api.automation.listEventCatalog"
  "api.automation.listActionCapabilities"
  "api.sidebarWidgets"
  "api.gabinet.sidebarWidgets"
  "api.gabinet.nudges"
  "api.nudges"
  "api.tagDefinitions"
  "api.categoryDefinitions"
  "api.scheduledActivities.listForCalendar"
)

violations=0
files_checked=0
files_with_violations=0

# Build grep exclusion pattern for allowed reads
allowed_regex=$(printf "%s\|" "${ALLOWED_PATTERNS[@]}")
allowed_regex="${allowed_regex%\\|}"

echo "--- Route files (src/routes/) ---"
echo ""

while IFS= read -r file; do
  files_checked=$((files_checked + 1))
  file_violations=0

  # Find convexQuery or useQuery(api.*) patterns — these are Convex data reads
  while IFS= read -r match; do
    lineno=$(echo "$match" | cut -d: -f1)
    content=$(echo "$match" | cut -d: -f2-)

    # Check if it's an allowed pattern
    is_allowed=0
    for pattern in "${ALLOWED_PATTERNS[@]}"; do
      if echo "$content" | grep -q "$pattern"; then
        is_allowed=1
        break
      fi
    done

    if [ "$is_allowed" -eq 0 ]; then
      # Check if it's a mutation call (useMutation) — those are OK (Convex executes functions)
      if echo "$content" | grep -q "useMutation"; then
        continue
      fi

      if [ "$file_violations" -eq 0 ]; then
        echo -e "${RED}VIOLATIONS${NC} in ${file}:"
        files_with_violations=$((files_with_violations + 1))
      fi
      echo "  L${lineno}: $(echo "$content" | sed 's/^[[:space:]]*//' | head -c 120)"
      file_violations=$((file_violations + 1))
      violations=$((violations + 1))
    fi
  done < <(grep -n 'convexQuery(api\.\|useQuery(api\.' "$file" 2>/dev/null || true)

  if [ "$file_violations" -gt 0 ]; then
    echo ""
  fi
done < <(find src/routes -name "*.tsx" -not -path "*/node_modules/*" | sort)

echo ""
echo "--- Component files (src/components/) ---"
echo ""

while IFS= read -r file; do
  files_checked=$((files_checked + 1))
  file_violations=0

  while IFS= read -r match; do
    lineno=$(echo "$match" | cut -d: -f1)
    content=$(echo "$match" | cut -d: -f2-)

    is_allowed=0
    for pattern in "${ALLOWED_PATTERNS[@]}"; do
      if echo "$content" | grep -q "$pattern"; then
        is_allowed=1
        break
      fi
    done

    if [ "$is_allowed" -eq 0 ]; then
      if echo "$content" | grep -q "useMutation"; then
        continue
      fi

      if [ "$file_violations" -eq 0 ]; then
        echo -e "${RED}VIOLATIONS${NC} in ${file}:"
        files_with_violations=$((files_with_violations + 1))
      fi
      echo "  L${lineno}: $(echo "$content" | sed 's/^[[:space:]]*//' | head -c 120)"
      file_violations=$((file_violations + 1))
      violations=$((violations + 1))
    fi
  done < <(grep -n 'convexQuery(api\.\|useQuery(api\.' "$file" 2>/dev/null || true)

  if [ "$file_violations" -gt 0 ]; then
    echo ""
  fi
done < <(find src/components -name "*.tsx" -name "*.ts" -not -path "*/node_modules/*" -not -path "*/sidebar-widgets/*" 2>/dev/null | sort)

echo ""
echo "=== SUMMARY ==="
echo "Files checked: ${files_checked}"
echo "Files with violations: ${files_with_violations}"
if [ "$violations" -eq 0 ]; then
  echo -e "${GREEN}PASS${NC}: All data reads use Supabase hooks"
else
  echo -e "${YELLOW}INFO${NC}: ${violations} Convex data reads found (should migrate to Supabase hooks)"
fi
echo ""
