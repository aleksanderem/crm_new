---
description: Work on a specific module with full context loaded. Usage: /module-work <platform|crm|gabinet> <task description>
---

You are working on module: $ARGUMENTS

Before making any change:
1. Read the module context file at docs/modules/<module>.md
2. Read the CLAUDE.md for project conventions
3. Check what exists in the relevant convex/ and src/ directories
4. Think about what the USER of this module actually needs — not what's technically interesting

Rules:
- Follow existing patterns exactly. Read 2-3 similar files before writing new code.
- Every backend mutation must use verifyOrgAccess. Permission-sensitive ops must use checkPermission.
- UI components must use existing shadcn/ui primitives from src/components/ui/.
- Use useOrganization() for org context, useTranslation() for labels.
- Add translation keys to public/locales/pl/translation.json and public/locales/en/translation.json.
- Test with `npx tsc --noEmit` after changes.
- If you create a new route, add it to the sidebar in app-sidebar.tsx.
- If you modify schema.ts, run `npx convex dev --once` to validate.

Cross-module rules:
- Platform code (convex/ root, src/components/ root) is shared — changes affect all modules.
- Module code (convex/crm/, convex/gabinet/, src/components/crm/, src/components/gabinet/) is isolated.
- Never import from one module into another. Use platform layer for shared functionality.
- Document data sources are the integration point — each module registers its own sources.
