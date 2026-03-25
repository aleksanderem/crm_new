#!/usr/bin/env bash
set -euo pipefail

# Untitled UI → Prefixed Token Transform
# Transforms bare Tailwind token classes (bg-primary, text-secondary, etc.)
# to prefixed equivalents (bg-bg-primary, text-fg-secondary, etc.)
# that resolve to the compat CSS variables in src/styles/untitled-ui-compat.css.
#
# Usage:
#   ./scripts/untitled-ui-postinstall.sh path/to/file.tsx    # single file
#   ./scripts/untitled-ui-postinstall.sh --all                # all UTUI components
#
# Idempotent: safe to run multiple times on the same file.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

UTUI_DIRS=(
  "$PROJECT_ROOT/src/components/base"
  "$PROJECT_ROOT/src/components/application"
)

transform_file() {
  local file="$1"

  # Skip non-existent or non-text files
  [[ -f "$file" ]] || return 0
  [[ "$file" == *.tsx || "$file" == *.ts ]] || return 0

  # All replacements in a single perl pass.
  # Order: most-specific first (longer suffixes before shorter).
  # Negative lookbehind (?<![-]) prevents re-matching already-prefixed tokens.
  # Negative lookahead (?![-_a-z0-9]) prevents partial matches (e.g. bg-primary-foreground).
  perl -i -pe '
    # --- Background classes ---
    s/(?<![-])bg-primary_hover(?![-_a-z0-9])/bg-bg-primary_hover/g;
    s/(?<![-])bg-primary_alt(?![-_a-z0-9])/bg-bg-primary_alt/g;
    s/(?<![-])bg-primary-solid(?![-_a-z0-9])/bg-bg-primary-solid/g;
    s/(?<![-])bg-primary-25(?![-_a-z0-9])/bg-brand-25/g;
    s/(?<![-])bg-primary(?![-_a-z0-9])/bg-bg-primary/g;
    s/(?<![-])bg-secondary_hover(?![-_a-z0-9])/bg-bg-secondary_hover/g;
    s/(?<![-])bg-secondary_alt(?![-_a-z0-9])/bg-bg-secondary_alt/g;
    s/(?<![-])bg-secondary(?![-_a-z0-9])/bg-bg-secondary/g;
    s/(?<![-])bg-tertiary(?![-_a-z0-9])/bg-bg-tertiary/g;

    # --- Text/foreground classes ---
    s/(?<![-])text-secondary_hover(?![-_a-z0-9])/text-fg-secondary_hover/g;
    s/(?<![-])text-tertiary_hover(?![-_a-z0-9])/text-fg-tertiary_hover/g;
    s/(?<![-])text-primary(?![-_a-z0-9])/text-fg-primary/g;
    s/(?<![-])text-secondary(?![-_a-z0-9])/text-fg-secondary/g;
    s/(?<![-])text-tertiary(?![-_a-z0-9])/text-fg-tertiary/g;
    s/(?<![-])text-quaternary(?![-_a-z0-9])/text-fg-quaternary/g;

    # --- Border classes ---
    s/(?<![-])border-primary(?![-_a-z0-9])/border-border-primary/g;
    s/(?<![-])border-secondary(?![-_a-z0-9])/border-border-secondary/g;

    # --- Ring classes ---
    s/(?<![-])ring-secondary_alt(?![-_a-z0-9])/ring-border-secondary_alt/g;
    s/(?<![-])ring-primary(?![-_a-z0-9])/ring-border-primary/g;
    s/(?<![-])ring-secondary(?![-_a-z0-9])/ring-border-secondary/g;
  ' "$file"
}

if [[ "${1:-}" == "--all" ]]; then
  count=0
  for dir in "${UTUI_DIRS[@]}"; do
    if [[ -d "$dir" ]]; then
      while IFS= read -r -d '' file; do
        transform_file "$file"
        ((count++))
      done < <(find "$dir" -type f \( -name "*.tsx" -o -name "*.ts" \) -print0)
    fi
  done
  echo "Transformed $count files."
elif [[ -n "${1:-}" ]]; then
  transform_file "$1"
else
  echo "Usage: $0 <file.tsx|--all>"
  exit 1
fi
