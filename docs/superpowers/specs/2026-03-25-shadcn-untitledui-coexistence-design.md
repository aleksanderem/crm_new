# shadcn + Untitled UI v8 Coexistence Design

## Problem

Both shadcn/ui and Untitled UI v8 use bare Tailwind v4 color token names (`bg-primary`, `text-primary`, `border-primary`, etc.) but assign them completely different semantic meanings. In Tailwind v4, `bg-primary` resolves to `background-color: var(--color-primary)`. shadcn defines `--color-primary` as the brand purple color, while Untitled UI expects it to be white (primary background surface). This makes it impossible for both systems to work correctly in the same project without intervention.

Additionally, Untitled UI components use variant tokens like `bg-primary_hover` which resolve to `--color-primary_hover` — a token that doesn't exist in the current theme at all, making those components partially broken even without the shadcn conflict.

The project already has `src/styles/untitled-ui-compat.css` which defines ~140 properly prefixed semantic tokens (`--color-bg-primary`, `--color-fg-primary`, `--color-border-primary`, etc.) with full light and dark mode support. However, the Untitled UI components don't reference these prefixed tokens — they still use the bare names from their standalone theme setup.

## Conflicting Token Names

| Tailwind class | shadcn resolves to | Untitled UI expects |
|---------------|-------------------|-------------------|
| `bg-primary` | purple (brand) | white (surface) |
| `bg-secondary` | light gray | gray-50 |
| `bg-tertiary` | n/a (undefined) | gray-100 |
| `text-primary` | purple | gray-900 (body text) |
| `text-secondary` | dark on secondary | gray-700 |
| `text-tertiary` | n/a (undefined) | gray-600 |
| `text-quaternary` | n/a (undefined) | gray-500 |
| `ring-primary` | purple ring | gray-300 border |
| `ring-secondary` | shadcn secondary | gray-200 |
| `border-primary` | shadcn border var | gray-300 |
| `border-secondary` | shadcn secondary | gray-200 |

Non-conflicting Untitled UI tokens (already namespaced): `bg-brand-solid`, `text-fg-quaternary`, `border-border-brand`, `bg-error-primary`, `ring-border-error`, etc. These work correctly today.

## Solution: Transform Untitled UI Components to Prefixed Tokens

Modify all Untitled UI component files (`src/components/base/`, `src/components/application/`) to use the prefixed token classes that map to the existing compat CSS variables. shadcn components remain completely untouched.

### Token Mapping Rules

Background classes:
```
bg-primary        → bg-bg-primary
bg-primary_hover  → bg-bg-primary_hover
bg-primary_alt    → bg-bg-primary_alt
bg-primary-solid  → bg-bg-primary-solid
bg-primary-25     → bg-brand-25
bg-secondary      → bg-bg-secondary
bg-secondary_hover → bg-bg-secondary_hover
bg-secondary_alt  → bg-bg-secondary_alt
bg-tertiary       → bg-bg-tertiary
```

Text/foreground classes:
```
text-primary         → text-fg-primary
text-secondary       → text-fg-secondary
text-secondary_hover → text-fg-secondary_hover
text-tertiary        → text-fg-tertiary
text-tertiary_hover  → text-fg-tertiary_hover
text-quaternary      → text-fg-quaternary
```

Border/ring classes:
```
border-primary       → border-border-primary
border-secondary     → border-border-secondary
ring-primary         → ring-border-primary
ring-secondary       → ring-border-secondary
ring-secondary_alt   → ring-border-secondary_alt
```

### Exceptions (DO NOT transform)

These patterns must be excluded from transformation:

- `text-primary-foreground` — shadcn token used intentionally in Untitled UI files
- `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-accent`, `bg-background`, `bg-muted` — shadcn tokens used intentionally by some Untitled UI components (button.tsx tertiary variant, tabs.tsx, button-group.tsx, calendar components) for cross-system integration
- Already-prefixed classes: `bg-bg-*`, `text-fg-*`, `text-text-*`, `border-border-*`
- Palette references: `bg-brand-*`, `bg-gray-*`, `bg-error-*`, `bg-warning-*`, `bg-success-*`
- Utility color classes: `bg-utility-*`, `text-utility-*`, `ring-utility-*` — handled separately (see Utility Token Aliases section)
- Classes outside `src/components/base/` and `src/components/application/`

Tailwind state prefixes (`hover:`, `focus:`, `disabled:`, `dark:`, `group-hover:`, `data-*:`, etc.) are transparent — `hover:bg-primary` transforms to `hover:bg-bg-primary`. The regex matches the token portion after any prefix chain.

### Regex Implementation

macOS ships with BSD sed which does NOT support `\b` word boundaries. The script uses `perl -pe` for reliable lookahead/lookbehind matching:

```perl
# Example: bg-primary → bg-bg-primary
# Matches bg-primary NOT preceded by - (prevents bg-bg-primary re-match)
# NOT followed by [-_a-z0-9] (prevents bg-primary-foreground, bg-primary_hover partial match)
perl -pe 's/(?<![-])bg-primary(?![-_a-z0-9])/bg-bg-primary/g'
```

Replacements are ordered most-specific first (e.g. `bg-primary_hover` before `bg-primary`) to prevent partial matches. The negative lookbehind `(?<![-])` ensures already-prefixed tokens like `bg-bg-primary` are not matched again, making the script fully idempotent.

The same pattern applies to all prefix types:
```perl
# bg-primary → bg-bg-primary (after transform: bg-bg-primary, lookbehind sees `-`, skips)
perl -pe 's/(?<![-])bg-primary(?![-_a-z0-9])/bg-bg-primary/g'

# text-primary → text-fg-primary (after transform: text-fg-primary, no `text-primary` substring remains)
perl -pe 's/(?<![-])text-primary(?![-_a-z0-9])/text-fg-primary/g'

# border-primary → border-border-primary (after transform: border-border-primary, lookbehind sees `-`, skips)
perl -pe 's/(?<![-])border-primary(?![-_a-z0-9])/border-border-primary/g'

# ring-primary → ring-border-primary (after transform: ring-border-primary, no `ring-primary` substring remains)
perl -pe 's/(?<![-])ring-primary(?![-_a-z0-9])/ring-border-primary/g'
```

For `text-*` and `ring-*` mappings, idempotency is inherent because the output (`text-fg-primary`, `ring-border-primary`) does not contain the input pattern (`text-primary`, `ring-primary`) as a substring. For `bg-*` and `border-*` where the output contains the input (e.g. `bg-bg-primary` contains `bg-primary`), the negative lookbehind on `-` prevents re-matching.

## Utility Token Aliases

The badges component uses utility color aliases that don't exist in the compat CSS:

| Badge alias | Maps to compat CSS |
|------------|-------------------|
| `utility-neutral-*` | `utility-gray-*` |
| `utility-red-*` | `utility-error-*` |
| `utility-slate-*` | `utility-gray-blue-*` |
| `utility-sky-*` | `utility-blue-light-*` |

These are NOT handled by the token mapping script. Instead, add CSS variable aliases to `untitled-ui-compat.css`:

```css
/* Badge utility aliases */
--color-utility-neutral-50: var(--color-utility-gray-50);
--color-utility-neutral-100: var(--color-utility-gray-100);
--color-utility-neutral-200: var(--color-utility-gray-200);
--color-utility-neutral-400: var(--color-utility-gray-400);
--color-utility-neutral-500: var(--color-utility-gray-500);
--color-utility-neutral-700: var(--color-utility-gray-700);
/* ... same pattern for red→error, slate→gray-blue, sky→blue-light */
```

This approach avoids modifying the badge component source and works for any future component that uses these aliases. No `.dark` block is needed for the aliases because they use `var()` indirection — the target variables (e.g. `--color-utility-gray-50`) are already overridden in the existing `.dark` section, and the `var()` reference chains through at computed-value time.

## Automation

### Post-install Script: `scripts/untitled-ui-postinstall.sh`

A bash script that applies all token mapping rules to Untitled UI component files. Uses `perl -pe` for regex. Idempotent — safe to run multiple times on the same file with no side effects.

Two modes:
```bash
# Single file or directory
./scripts/untitled-ui-postinstall.sh src/components/base/buttons/button.tsx

# All Untitled UI components (one-time migration + future re-runs)
./scripts/untitled-ui-postinstall.sh --all
```

The `--all` flag recursively finds every `.tsx` and `.ts` file under `src/components/base/` and `src/components/application/` using `find`.

### Claude Code Hook: PostToolUse on Write/Edit

In `.claude/settings.json`, a PostToolUse hook triggers the transform script whenever Claude writes or edits a file within the Untitled UI component directories. The hook reads the tool input from stdin (JSON format), extracts the `file_path`, and runs the script if the path matches.

Hook configuration (added alongside existing cross-module hook):
```json
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
```

### Limitation: External CLI

When running `npx untitledui add` directly in the terminal (not through Claude), the PostToolUse hook does NOT fire — it only triggers on Claude Code's own Write/Edit tool calls. After adding components via CLI, run the script manually:

```bash
./scripts/untitled-ui-postinstall.sh --all
```

This is a conscious trade-off. Fully automatic interception of external CLI writes would require a filesystem watcher (fswatch/inotify), which is over-engineering for this use case.

## Compat CSS Maintenance

The existing `src/styles/untitled-ui-compat.css` defines most required tokens. Changes needed:

1. Add `--color-bg-primary_alt` (light: `var(--color-gray-25)`, dark: `var(--color-gray-900)`) — used by `avatar-add-button.tsx`
2. Add utility color aliases for badges (neutral, red, slate, sky) — both light and dark sections
3. Fix dark mode values for `--color-bg-warning-primary` and `--color-bg-success-primary` — currently set to light-mode values (`warning-50`, `success-50`) instead of dark equivalents

When new components from CLI introduce tokens not yet in the compat CSS, the missing token manifests as a transparent/invisible element in the browser. The fix is to add the missing `--color-*` variable to the compat CSS (both light and dark sections).

## Scope

### In scope (ordered — steps 1-2 MUST complete before step 3)
1. Fill missing tokens and utility aliases in `untitled-ui-compat.css` (light + dark) — FIRST, so transformed classes have variables to resolve to
2. Fix dark mode `bg-warning-primary` and `bg-success-primary` values in compat CSS
3. Create `scripts/untitled-ui-postinstall.sh` with all mapping rules (perl-based, idempotent)
4. Run one-time migration on all 48 files in `base/` + `application/` (recursive find)
5. Add Claude Code PostToolUse hook to `.claude/settings.json`
6. Verify: `npx tsc --noEmit` passes, visual check in browser

### Out of scope
- Changes to shadcn components (`src/components/ui/`) — zero modifications
- Changes to `src/index.css` `@theme inline` block — stays as-is
- DataListFilterBar redesign — separate work after this migration
- Full dark mode visual audit — compat CSS already has dark tokens, we verify but don't audit exhaustively
- Installing new Untitled UI components from CLI — hook handles Claude-initiated writes; manual `--all` for direct CLI use

## File Inventory

Files to transform (Untitled UI) — 48 files total, recursively under:
- `src/components/base/` (buttons, input, dropdown, badges, radio-buttons, avatar, tooltip, button-group)
- `src/components/application/` (tabs, app-navigation, calendar, filter-bar, section-headers, breadcrumbs, date-picker, activity-feed)

Files to modify (CSS):
- `src/styles/untitled-ui-compat.css` — add missing tokens and utility aliases

Files to create:
- `scripts/untitled-ui-postinstall.sh` — transform script

Files to modify (config):
- `.claude/settings.json` — add PostToolUse hook

Files NOT touched:
- All 67 files in `src/components/ui/` (shadcn)
- `src/index.css`

## Verification

1. `npx tsc --noEmit` — zero type errors (transformations are class strings only, no TS impact)
2. Visual spot-check: Button, Input, Dropdown, Tabs, Badge, Avatar — should render with correct colors (white backgrounds, gray text, proper borders) instead of purple
3. shadcn components (Dialog, Sheet, DropdownMenu, etc.) — should be visually unchanged
4. Dark mode toggle — both systems should respect dark theme
5. Run script twice on same file — output must be identical (idempotency check)
