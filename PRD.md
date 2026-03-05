# PRD: UI Polish — Icons, Contextual Actions, Permissions, Quick-Create

## Context

The CRM platform needs polish across four systems: icon consistency, the sidebar middle-panel contextual actions, the RBAC permissions architecture, and the quick-create modal. All changes must maintain existing functionality while improving UX quality.

Key files to understand before starting:
- `src/components/layout/app-sidebar.tsx` — sidebar with icon column (left), contextual actions panel (middle), main content (right)
- `src/components/crm/quick-create-menu.tsx` — quick-create modal with CRM/Gabinet/System tabs
- `convex/permissions.ts` + `convex/_helpers/permissions.ts` — RBAC system
- `src/lib/ez-icons/` — icon wrapper library supporting `size` and `variant` (stroke/solid/bulk/duotone/twotone) props

---

## Tasks

### 1. Icon Standardization (16px stroke)

All icons in the left sidebar column and middle contextual-actions panel should be 16px (size-4 / `className="size-4"`) using the stroke variant. Currently icons are mixed sizes (size-5, size-6, size-7, size-8).

- [x] Audit `app-sidebar.tsx`: change all sidebar menu item icons (left icon column) to `size-4` (16px). The CSS selectors `[&>svg]:size-6` and `[&>easier-icon]:size-6` on `SidebarMenuButton` must become `size-4`. Keep the app logo icon larger if needed (size-5 max).
- [x] Audit `app-sidebar.tsx`: change all contextual action icons in the middle panel (the grid of action buttons under "Actions") to `size-4`.
- [x] Ensure all icons in both columns use the stroke variant. If the ez-icons component supports a `variant` prop, pass `variant="stroke"`. If icons are imported from `@/lib/ez-icons`, verify they default to stroke or explicitly set it.
- [x] Audit page header icons (the SidebarTrigger, search button, notification bell, theme switcher, user dropdown trigger in the sticky top header bar) — these should also be `size-4` for consistency, except where the button itself requires a larger touch target (keep button size, shrink icon inside).
- [x] Run typecheck and build to verify no breakage.

### 2. Middle Panel — Contextual Actions per View

The middle panel (second column, the "detail panel") currently shows a title and action buttons via `pageContexts`/`gabinetPageContexts` in `app-sidebar.tsx`. These need to be expanded with actually useful, context-relevant actions and shortcuts for each view. Remove generic/unhelpful actions, add missing useful ones.

- [x] **Dashboard page**: Actions should include: View Pipeline (navigate to leads kanban), Add Deal (quickCreate lead), Today's Activities (navigate to activities with today filter), Quick Stats (navigate to dashboard settings or refresh), Export Report (placeholder or actual export).
- [x] **Contacts page**: Actions should include: Add Contact (quickCreate), Import CSV (navigate), Export CSV (navigate), Merge Duplicates (navigate to contacts with merge mode if exists, otherwise placeholder), Saved Views (toggle saved views panel).
- [x] **Companies page**: Actions should include: Add Company (quickCreate), Import CSV, Export CSV, View Relationships (navigate to a company relationships view or filter).
- [x] **Leads page**: Actions should include: Add Deal (quickCreate lead), View as Kanban (navigate to kanban view), View as Table (navigate to table view), Pipeline Settings (navigate to pipeline config), Import CSV, Export CSV.
- [x] **Activities page**: Actions should include: Add Activity (quickCreate), Filter by Type (open type filter dropdown or navigate with filter), Calendar View (navigate to calendar), Upcoming Only (toggle showing only future activities).
- [x] **Calendar page**: Actions should include: Add Appointment (quickCreate appointment if gabinet active, otherwise quickCreate activity), Go to Today (scroll calendar to today), Switch View (day/week/month toggle if not already in toolbar).
- [x] **Documents page**: Actions should include: Upload Document (trigger document upload dialog), Create from Template (placeholder), Filter by Type, Bulk Actions.
- [x] **Products page**: Fix the bug — current quickCreate action is "document" but should be "product". Actions should include: Add Product (quickCreate product — see quick-create section), Import CSV, Export CSV, Category Filter.
- [x] **Gabinet Patients page**: Actions should include: Add Patient (quickCreate patient), Import Patients, Search Patients, Filter by Status (active/inactive), View Patient Stats.
- [x] **Gabinet Treatments page**: Actions should include: Add Treatment (quickCreate treatment), Filter by Category, Sort by Price/Duration, Manage Categories.
- [x] **Gabinet Calendar page**: Actions should include: Add Appointment (quickCreate appointment), Go to Today, View Day/Week/Month, Filter by Employee, Filter by Treatment Type.
- [x] Add i18n keys for all new action labels in both `en/translation.json` and `pl/translation.json`.
- [x] Run typecheck and build.

### 3. Permissions System — Better Organization

The RBAC system in `convex/_helpers/permissions.ts` works but needs better structure: typed feature/action constants, frontend permission awareness, and the quick-create modal should respect permissions.

- [x] Extract permission constants into a shared file `convex/_helpers/permissionTypes.ts` (or similar) that exports: `FEATURES` (array/enum of all feature names), `ACTIONS` (array/enum of all action names), `SCOPES` (array/enum), `DEFAULT_PERMISSIONS` (the role→feature→action→scope mapping). Import these in both `permissions.ts` and frontend code. This removes magic strings spread across files.
- [x] Create a frontend React hook `usePermission(feature, action)` that calls the existing `getMyPermissions` query and returns `{ allowed: boolean, scope: string, loading: boolean }`. Place in `src/hooks/use-permission.ts`. This hook should use the org context from `useOrganization()`.
- [x] Create a frontend wrapper component `<PermissionGate feature="leads" action="create">` that conditionally renders children based on permission. Falls back to nothing (or optional `fallback` prop). Place in `src/components/crm/permission-gate.tsx`.
- [x] Wrap quick-create menu entity buttons with permission checks: hide or disable items the user lacks "create" permission for. Use the `usePermission` hook. Map entity types to permission features (contact→contacts, lead→leads, patient→gabinet_patients, etc.).
- [x] Wrap sidebar contextual action buttons with permission checks where the action is a create operation.
- [x] Add i18n keys for permission-denied states if showing disabled buttons (e.g., "You don't have permission to create contacts").
- [x] Run typecheck and build.

### 4. Quick-Create Modal — Complete All Entities

The quick-create modal (`src/components/crm/quick-create-menu.tsx`) already lists 13 entity types across CRM/Gabinet/System tabs. Several have `hasForm: false` and just navigate away. All should have proper inline forms.

- [ ] **Product** — add product to the entityItems list (currently missing entirely). Type: "product", group: "crm", icon: appropriate product icon, hasForm: true. Create the inline form with fields: name, description, price, currency, unit, sku, isActive. Add the case to `renderQuickCreateForm` in `_layout.tsx`.
- [ ] **Call** — change `hasForm: false` to `true` for calls. Create an inline call-logging form with fields: contact selector (search contacts), phone number (auto-fill from contact), direction (inbound/outbound), duration, outcome (select: connected/voicemail/no_answer/busy), notes. Add the case to `renderQuickCreateForm`.
- [ ] **Document** — change `hasForm: false` to `true` for documents. Create an inline document form with fields: title, file upload (use Convex file storage), entity link (optional: link to contact/company/lead), description/notes. Add the case to `renderQuickCreateForm`.
- [ ] Fix the `renderQuickCreateForm` switch in `_layout.tsx` to handle ALL entity types including: product, call, document, gabinetDocument (if applicable). Every `FormEntityType` must have a corresponding form rendered.
- [ ] Verify each form submits correctly by testing: open quick-create → select entity → fill form → submit → entity appears in the relevant list page.
- [ ] Add missing i18n keys for form labels, placeholders, and success/error messages for product, call, and document forms in both translation files.
- [ ] Run typecheck and build.

### Integration & Verification

- [ ] Verify all CRM pages render without error boundaries after icon/action changes.
- [ ] Verify quick-create modal opens, all tabs work, all entity forms render and submit.
- [ ] Verify that a "viewer" role user sees appropriately restricted quick-create options (permission gate working).
- [ ] Run `npm run typecheck` — must pass with 0 errors.
- [ ] Run `npm run build` — must succeed.
