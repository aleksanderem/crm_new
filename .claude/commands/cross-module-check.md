---
description: Verify cross-module consistency after changes. Run this before committing.
---

Run these checks and report results:

1. TypeScript: `npx tsc --noEmit` — must pass with 0 errors.

2. Import boundaries: Verify no cross-module imports exist.
   - Files in convex/crm/ must NOT import from convex/gabinet/ and vice versa.
   - Files in src/components/crm/ must NOT import from src/components/gabinet/ and vice versa.
   - Both modules CAN import from convex/ root and src/components/ root (platform layer).

3. Pattern consistency: For any new list/detail page, verify it follows the same structure as existing ones:
   - List pages: PageHeader + DataTable with saved views + sidebar actions
   - Detail pages: Left sidebar with fields + tabbed main area
   - Dialogs: DialogHeader + form + DialogFooter with cancel/submit

4. Translation completeness: For any new UI text, verify keys exist in both pl and en translation files.

5. RBAC: For any new mutation, verify verifyOrgAccess is called. For user-facing actions, verify checkPermission is called.

6. Schema: If schema.ts was modified, verify all new fields have appropriate indexes.

Report format:
```
## Cross-Module Check
- TypeScript: PASS/FAIL
- Import boundaries: PASS/FAIL [details]
- Pattern consistency: PASS/FAIL [details]
- Translations: PASS/FAIL [missing keys]
- RBAC: PASS/FAIL [unprotected mutations]
- Schema: PASS/FAIL [missing indexes]
```
