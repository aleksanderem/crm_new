# shadcn + Untitled UI v8 Coexistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make shadcn/ui and Untitled UI v8 components work side-by-side without CSS token conflicts by transforming Untitled UI components to use prefixed token classes.

**Architecture:** Transform all Untitled UI component files (in `src/components/base/` and `src/components/application/`) to use prefixed Tailwind classes (e.g. `bg-bg-primary` instead of `bg-primary`) that resolve to the already-defined compat CSS variables. A perl-based post-install script automates the transformation for future CLI additions. shadcn components remain untouched.

**Tech Stack:** Tailwind CSS v4, perl (regex), bash, CSS custom properties

**Spec:** `docs/superpowers/specs/2026-03-25-shadcn-untitledui-coexistence-design.md`

---

## File Structure

Files to create:
- `scripts/untitled-ui-postinstall.sh` — idempotent perl-based token transform script

Files to modify:
- `src/styles/untitled-ui-compat.css` — add missing tokens and utility aliases
- `.claude/settings.json` — add PostToolUse hook for auto-transform
- ~48 files in `src/components/base/` and `src/components/application/` — transformed by script (not manually edited)

Files NOT touched:
- All files in `src/components/ui/` (shadcn)
- `src/index.css`

---

### Task 1: Add missing tokens to compat CSS

**Files:**
- Modify: `src/styles/untitled-ui-compat.css:125` (add `--color-bg-primary_alt` after `--color-bg-primary-solid`)
- Modify: `src/styles/untitled-ui-compat.css:269` (add utility aliases before COMPONENT COLORS)
- Modify: `src/styles/untitled-ui-compat.css:330-331` (fix dark mode warning/success)
- Modify: `src/styles/untitled-ui-compat.css:315` (add dark `--color-bg-primary_alt`)

- [ ] **Step 1: Add `--color-bg-primary_alt` to light mode section**

In `src/styles/untitled-ui-compat.css`, after line 125 (`--color-bg-primary-solid`), add:

```css
  --color-bg-primary_alt: var(--color-gray-25);
```

- [ ] **Step 2: Add utility color aliases to light mode section**

Before line 269 (`/* ── COMPONENT COLORS ── */`), add:

```css
  /* ── UTILITY ALIASES (badge color variants) ── */
  /* neutral → gray */
  --color-utility-neutral-50: var(--color-utility-gray-50);
  --color-utility-neutral-100: var(--color-utility-gray-100);
  --color-utility-neutral-200: var(--color-utility-gray-200);
  --color-utility-neutral-400: var(--color-utility-gray-400);
  --color-utility-neutral-500: var(--color-utility-gray-500);
  --color-utility-neutral-700: var(--color-utility-gray-700);

  /* red → error */
  --color-utility-red-50: var(--color-utility-error-50);
  --color-utility-red-100: var(--color-utility-error-100);
  --color-utility-red-200: var(--color-utility-error-200);
  --color-utility-red-400: var(--color-utility-error-400);
  --color-utility-red-500: var(--color-utility-error-500);
  --color-utility-red-700: var(--color-utility-error-700);

  /* slate → gray-blue */
  --color-utility-slate-50: var(--color-utility-gray-blue-50);
  --color-utility-slate-100: var(--color-utility-gray-blue-100);
  --color-utility-slate-200: var(--color-utility-gray-blue-200);
  --color-utility-slate-400: var(--color-utility-gray-blue-400);
  --color-utility-slate-500: var(--color-utility-gray-blue-500);
  --color-utility-slate-700: var(--color-utility-gray-blue-700);

  /* sky → blue-light */
  --color-utility-sky-50: var(--color-utility-blue-light-50);
  --color-utility-sky-100: var(--color-utility-blue-light-100);
  --color-utility-sky-200: var(--color-utility-blue-light-200);
  --color-utility-sky-400: var(--color-utility-blue-light-400);
  --color-utility-sky-500: var(--color-utility-blue-light-500);
  --color-utility-sky-700: var(--color-utility-blue-light-700);
```

- [ ] **Step 3: Add dark mode `--color-bg-primary_alt`**

In the `.dark` section, after `--color-bg-primary_hover` (around line 310), add:

```css
  --color-bg-primary_alt: var(--color-gray-900);
```

- [ ] **Step 4: Fix dark mode warning/success background values**

In the `.dark` section (lines 330-331), change:

```css
  /* BEFORE */
  --color-bg-warning-primary: var(--color-warning-50);
  --color-bg-success-primary: var(--color-success-50);

  /* AFTER */
  --color-bg-warning-primary: var(--color-warning-700);
  --color-bg-success-primary: var(--color-success-700);
```

Note: utility aliases do NOT need `.dark` overrides because they use `var()` indirection to the target tokens which are already overridden in `.dark`.

- [ ] **Step 5: Verify CSS is valid**

Run: `npm run dev` (start dev server briefly to check for CSS parse errors, then stop)
Expected: Dev server starts without CSS errors in terminal output.

- [ ] **Step 6: Commit**

```bash
git add src/styles/untitled-ui-compat.css
git commit -m "style: add missing compat tokens and utility aliases for UTUI coexistence"
```

---

### Task 2: Create the post-install transform script

**Files:**
- Create: `scripts/untitled-ui-postinstall.sh`

- [ ] **Step 1: Create the script**

Create `scripts/untitled-ui-postinstall.sh` with the following content:

```bash
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
```

- [ ] **Step 2: Make executable**

Run: `chmod +x scripts/untitled-ui-postinstall.sh`

- [ ] **Step 3: Test idempotency on a single file**

Run:
```bash
# Copy a file, transform twice, compare
cp src/components/base/buttons/button.tsx /tmp/button-before.tsx
./scripts/untitled-ui-postinstall.sh src/components/base/buttons/button.tsx
cp src/components/base/buttons/button.tsx /tmp/button-after-1.tsx
./scripts/untitled-ui-postinstall.sh src/components/base/buttons/button.tsx
diff /tmp/button-after-1.tsx src/components/base/buttons/button.tsx
```

Expected: `diff` produces no output (files identical after second run).

- [ ] **Step 4: Verify exceptions are respected (on the transformed file, before restoring)**

Run:
```bash
grep -n "text-primary-foreground\|text-foreground\|bg-card\|bg-accent\|bg-background\|bg-muted" src/components/base/buttons/button.tsx
```

Expected: These shadcn tokens should remain unchanged (NOT transformed to `text-fg-primary-foreground` etc.). We check the transformed file intentionally to confirm exceptions survive the transform.

- [ ] **Step 5: Restore test file and commit script**

Run:
```bash
git checkout src/components/base/buttons/button.tsx
git add scripts/untitled-ui-postinstall.sh
git commit -m "feat: add Untitled UI post-install token transform script"
```

---

### Task 3: Run one-time migration on all components

**Files:**
- Modify: ~48 files in `src/components/base/` and `src/components/application/` (via script)

- [ ] **Step 1: Run the migration**

Run: `./scripts/untitled-ui-postinstall.sh --all`
Expected: Output like `Transformed 48 files.`

- [ ] **Step 2: Verify no double-prefixing**

Run:
```bash
grep -rn "bg-bg-bg-\|text-fg-fg-\|border-border-border-\|ring-border-border-" src/components/base/ src/components/application/ | head -5
```

Expected: No output (zero double-prefixed tokens).

- [ ] **Step 3: Verify shadcn exceptions preserved**

Run:
```bash
grep -rn "text-foreground\b" src/components/base/ src/components/application/ | head -5
```

Expected: Matches exist — `text-foreground` was NOT transformed to `text-fg-foreground`.

- [ ] **Step 4: Verify key transformations applied**

Run:
```bash
# Should find bg-bg-primary (transformed), NOT bare bg-primary
grep -rn "bg-bg-primary\b" src/components/base/buttons/button.tsx | head -3
# Should find NO bare bg-primary (except in comments)
grep -rn "\"bg-primary\b" src/components/base/buttons/button.tsx | head -3
```

Expected: First command shows matches, second shows none.

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 6: Run idempotency check on all files**

Run:
```bash
# Run again — should produce identical output
./scripts/untitled-ui-postinstall.sh --all
git diff --stat
```

Expected: `git diff --stat` shows no changes (script is idempotent).

- [ ] **Step 7: Commit all transformed files**

```bash
git add src/components/base/ src/components/application/
git commit -m "refactor: transform Untitled UI components to prefixed token classes

Remap bare Tailwind tokens (bg-primary, text-secondary, etc.) to
prefixed equivalents (bg-bg-primary, text-fg-secondary, etc.) that
resolve to compat CSS variables, eliminating shadcn token conflicts."
```

---

### Task 4: Add Claude Code PostToolUse hook

**Files:**
- Modify: `.claude/settings.json`

- [ ] **Step 1: Replace settings.json with updated content**

Replace the entire `.claude/settings.json` file with the content below. It includes the existing cross-module hook unchanged, plus the new Untitled UI token transform hook as a second entry in the `PostToolUse` array:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'input=$(cat); file=$(echo \"$input\" | grep -o '\"file_path\":\"[^\"]*\"' | head -1 | cut -d'\"' -f4); if [ -z \"$file\" ]; then exit 0; fi; case \"$file\" in */convex/crm/*) if grep -q \"from.*convex/gabinet\" \"$file\" 2>/dev/null; then echo \"CROSS-MODULE VIOLATION: $file imports from convex/gabinet/. Use platform layer instead.\" >&2; exit 1; fi ;; */convex/gabinet/*) if grep -q \"from.*convex/crm\" \"$file\" 2>/dev/null; then echo \"CROSS-MODULE VIOLATION: $file imports from convex/crm/. Use platform layer instead.\" >&2; exit 1; fi ;; */components/crm/*) if grep -q \"from.*components/gabinet\" \"$file\" 2>/dev/null; then echo \"CROSS-MODULE VIOLATION: $file imports from components/gabinet/. Use platform layer instead.\" >&2; exit 1; fi ;; */components/gabinet/*) if grep -q \"from.*components/crm\" \"$file\" 2>/dev/null; then echo \"CROSS-MODULE VIOLATION: $file imports from components/crm/. Use platform layer instead.\" >&2; exit 1; fi ;; esac; exit 0'"
          }
        ],
        "description": "Enforce module import boundaries — no cross-imports between crm and gabinet"
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'input=$(cat); file=$(echo \"$input\" | grep -o '\"file_path\":\"[^\"]*\"' | head -1 | cut -d'\"' -f4); if [ -z \"$file\" ]; then exit 0; fi; if echo \"$file\" | grep -qE \"src/components/(base|application)/\"; then bash scripts/untitled-ui-postinstall.sh \"$file\" 2>/dev/null; fi; exit 0'"
          }
        ],
        "description": "Auto-transform Untitled UI components to use prefixed tokens"
      }
    ]
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add .claude/settings.json
git commit -m "chore: add PostToolUse hook for Untitled UI token transform"
```

---

### Task 5: Verification

**Files:** None modified — read-only checks.

- [ ] **Step 1: TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 2: Start dev server and visual spot-check**

Run: `npm run dev`

Check these components in the browser:
- Untitled UI Button (`src/components/base/buttons/button.tsx`) — should have white background, not purple
- Untitled UI Input (`src/components/base/input/input.tsx`) — should have white background, gray border
- Untitled UI Dropdown (`src/components/base/dropdown/dropdown.tsx`) — white bg, proper text colors
- Untitled UI Badges (`src/components/base/badges/badges.tsx`) — correct utility colors per variant
- shadcn Dialog — should be visually unchanged (still uses purple primary)
- shadcn Button with `variant="default"` — should still have purple background

- [ ] **Step 3: Dark mode check**

Toggle dark mode. Verify:
- Untitled UI components use dark backgrounds (gray-950) instead of white
- shadcn components still work in dark mode
- Badge colors invert properly

- [ ] **Step 4: Final idempotency check**

Run:
```bash
./scripts/untitled-ui-postinstall.sh --all
git diff --stat
```

Expected: Zero changes — confirms all files are already transformed.
