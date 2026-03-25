# shadcn + Untitled UI v8 Coexistence Design

## Problem

Both shadcn/ui and Untitled UI v8 use bare Tailwind v4 color token names (`bg-primary`, `text-primary`, `border-primary`, etc.) but assign them completely different semantic meanings. In Tailwind v4, `bg-primary` resolves to `background-color: var(--color-primary)`. shadcn defines `--color-primary` as the brand purple color, while Untitled UI expects it to be white (primary background surface). This makes it impossible for both systems to work correctly in the same project without intervention.

The conflict affects 67 class usages across 15 Untitled UI component files and 46 usages across 67 shadcn component files. Additionally, Untitled UI components use variant tokens like `bg-primary_hover` which resolve to `--color-primary_hover` — a token that doesn't exist in the current theme at all, making those components partially broken even without the shadcn conflict.

The project already has `src/styles/untitled-ui-compat.css` which defines ~140 properly prefixed semantic tokens (`--color-bg-primary`, `--color-fg-primary`, `--color-border-primary`, etc.) with full light and dark mode support. However, the Untitled UI components don't reference these prefixed tokens — they still use the bare names from their standalone theme setup.

## Conflicting Token Names

| Tailwind class | shadcn resolves to | Untitled UI expects |
|---------------|-------------------|-------------------|
| `bg-primary` | purple (brand) | white (surface) |
| `text-primary` | purple | gray-900 (body text) |
| `ring-primary` | purple ring | gray-300 border |
| `border-primary` | shadcn border var | gray-300 |
| `bg-secondary` | light gray | gray-50 |
| `text-secondary` | dark on secondary | gray-700 |
| `ring-secondary` | shadcn secondary | gray-200 |
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
bg-secondary      → bg-bg-secondary
bg-secondary_hover → bg-bg-secondary_hover
bg-secondary_alt  → bg-bg-secondary_alt
```

Text/foreground classes:
```
text-primary      → text-fg-primary
text-secondary    → text-fg-secondary
text-secondary_hover → text-fg-secondary_hover
```

Border/ring classes:
```
border-primary    → border-border-primary
border-secondary  → border-border-secondary
ring-primary      → ring-border-primary
ring-secondary    → ring-border-secondary
ring-secondary_alt → ring-border-secondary_alt
```

### Exceptions (DO NOT transform)

These patterns must be excluded from transformation:

- `text-primary-foreground` — shadcn token used intentionally in some Untitled UI files
- Already-prefixed classes: `bg-bg-*`, `text-fg-*`, `text-text-*`, `border-border-*`
- Palette references: `bg-brand-*`, `bg-gray-*`, `bg-error-*`, `bg-warning-*`, `bg-success-*`
- Classes outside `src/components/base/` and `src/components/application/`
- Hover/focus state prefixes attached to the above (e.g. `hover:bg-primary` transforms to `hover:bg-bg-primary`)

### Regex Patterns

Each replacement uses word-boundary matching to prevent double-prefixing. The key constraint: `bg-primary` must match but `bg-bg-primary` and `bg-primary-foreground` must not.

Pattern structure (sed extended regex):
```
s/\bbg-primary\b(?![-_a-z])/bg-bg-primary/g
```

Since sed doesn't support lookahead, the script uses a two-pass approach: first replace, then check for double-prefix and undo if found. Or more practically: the replacements are ordered from most-specific to least-specific to avoid partial matches.

## Automation

### Post-install Script: `scripts/untitled-ui-postinstall.sh`

A bash script that applies all token mapping rules to Untitled UI component files. Idempotent — safe to run multiple times on the same file.

Two modes:
```bash
# Single file (after npx untitledui add)
./scripts/untitled-ui-postinstall.sh src/components/base/buttons/button.tsx

# All Untitled UI components (one-time migration)
./scripts/untitled-ui-postinstall.sh --all
```

The `--all` flag processes every `.tsx` and `.ts` file in `src/components/base/` and `src/components/application/`.

### Claude Code Hook: PostToolUse on Write/Edit

In `.claude/settings.json`, a PostToolUse hook triggers the transform script whenever a file is written or edited within the Untitled UI component directories. This means:

- When `npx untitledui add` installs a new component → Claude Code hook transforms it
- When Claude edits an Untitled UI component → hook re-applies transforms
- Manual edits are caught on next Claude interaction

Matcher: file path contains `src/components/base/` or `src/components/application/`.

Hook configuration:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "FILE=\"$TOOL_INPUT_FILE_PATH\"; if echo \"$FILE\" | grep -qE 'src/components/(base|application)/'; then bash scripts/untitled-ui-postinstall.sh \"$FILE\" 2>/dev/null; fi"
          }
        ]
      }
    ]
  }
}
```

## Compat CSS Maintenance

The existing `src/styles/untitled-ui-compat.css` defines most required tokens. Known gaps to fill:

- `--color-bg-primary_alt` — used by `avatar-add-button.tsx`, missing from compat CSS

When new components from CLI introduce tokens not yet in the compat CSS, the missing token manifests as a transparent/invisible element in the browser. The fix is to add the missing `--color-*` variable to the compat CSS (both light and dark sections). This is expected to be rare since the compat file already covers the full Untitled UI design token specification.

## Scope

### In scope
1. Create `scripts/untitled-ui-postinstall.sh` with all mapping rules
2. Run one-time migration on all 48 files in `base/` + `application/`
3. Add Claude Code PostToolUse hook to `.claude/settings.json`
4. Fill missing tokens in `untitled-ui-compat.css`
5. Verify: `npx tsc --noEmit` passes, visual check in browser

### Out of scope
- Changes to shadcn components (`src/components/ui/`) — zero modifications
- Changes to `src/index.css` `@theme inline` block — stays as-is
- DataListFilterBar redesign — separate work after this migration
- Full dark mode visual audit — compat CSS already has dark tokens, we verify but don't audit exhaustively
- Installing new Untitled UI components from CLI — deferred, hook will handle them automatically

## File Inventory

Files to transform (Untitled UI):
- `src/components/base/buttons/button.tsx` (267 lines)
- `src/components/base/buttons/button-utility.tsx`
- `src/components/base/input/input.tsx` (269 lines)
- `src/components/base/input/input-group.tsx` (131 lines)
- `src/components/base/input/label.tsx` (48 lines)
- `src/components/base/dropdown/dropdown.tsx` (161 lines)
- `src/components/base/badges/badges.tsx` (415 lines)
- `src/components/base/radio-buttons/radio-buttons.tsx` (127 lines)
- `src/components/base/avatar/base-components/avatar-add-button.tsx` (32 lines)
- `src/components/base/avatar/base-components/avatar-online-indicator.tsx`
- `src/components/base/avatar/base-components/avatar-company-icon.tsx`
- `src/components/base/avatar/avatar-profile-photo.tsx`
- `src/components/base/tooltip/tooltip.tsx` (107 lines)
- `src/components/application/app-navigation/base-components/mobile-header.tsx`
- `src/components/application/app-navigation/base-components/nav-item.tsx`
- `src/components/application/app-navigation/base-components/nav-account-card.tsx`
- All other `.tsx` files in these directories (48 total)

Files NOT touched:
- All 67 files in `src/components/ui/` (shadcn)
- `src/index.css`
- `src/styles/untitled-ui-compat.css` (only additions, no modifications to existing tokens)

## Verification

1. `npx tsc --noEmit` — zero type errors (transformations are class strings only, no TS impact expected)
2. Visual spot-check: Button, Input, Dropdown, Tabs, Badge, Avatar — should render with correct colors (white backgrounds, gray text, proper borders) instead of purple
3. shadcn components (Dialog, Sheet, DropdownMenu, etc.) — should be visually unchanged
4. Dark mode toggle — both systems should respect dark theme
