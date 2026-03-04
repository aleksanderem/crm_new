# PRD: Gabinet Module — Phase 1: Patients & Treatments

## Context

Port the Patients and Treatments foundation from the Karta clinic system into the CRM as the "Gabinet" module. These are core entities referenced by all later phases (appointments, scheduling, packages, loyalty, documents).

Follow existing CRM conventions: organizationId scoping, verifyOrgAccess/checkPermission auth, logActivity audit, i18n (PL/EN), CrmDataTable with SidePanel, shadcn/ui components.

Reference: `karta.md` for full spec details.

---

## Tasks

### Schema

- [x] Add `gabinetPatients` table to `convex/schema.ts` with fields: organizationId, contactId?, firstName, lastName, pesel?, dateOfBirth?, gender?, email, phone?, address?, medicalNotes?, allergies?, bloodType?, emergencyContactName?, emergencyContactPhone?, referralSource?, isActive, tags?, createdBy, createdAt, updatedAt. Indexes: by_org, by_orgAndEmail, by_orgAndPesel, by_orgAndContact. Search index on firstName + lastName filtered by organizationId.
- [x] Add `gabinetTreatments` table to `convex/schema.ts` with fields: organizationId, name, description?, category?, duration (minutes), price, currency (default "PLN"), taxRate?, contraindications?, preparationInstructions?, aftercareInstructions?, isActive, requiresApproval?, color?, sortOrder?, createdBy, createdAt, updatedAt. Indexes: by_org, by_orgAndCategory, by_orgAndActive.

### Backend — Patients

- [x] Create `convex/gabinet/patients.ts` with queries: list (paginated + search + filters), getById, getByContact. All use verifyOrgAccess.
- [x] Add mutations in `convex/gabinet/patients.ts`: create, update, remove (soft-delete via isActive=false). All use verifyOrgAccess + logActivity.

### Backend — Treatments

- [x] Create `convex/gabinet/treatments.ts` with queries: list (paginated), getById, listByCategory, listActive (non-paginated for dropdowns). All use verifyOrgAccess.
- [x] Add mutations in `convex/gabinet/treatments.ts`: create, update, remove (soft-delete). All use verifyOrgAccess + logActivity.

### Frontend — Patient List Page

- [x] Create `src/routes/_app/_auth/dashboard/_layout.gabinet.patients.index.tsx` with CrmDataTable showing columns: name (firstName + lastName), email, phone, dateOfBirth, tags, isActive, createdAt. Include SidePanel for create/edit with patient form.
- [x] Create patient form component with all fields organized in sections: Basic Info (name, email, phone, dateOfBirth, gender), Medical (pesel, bloodType, allergies, medicalNotes), Emergency Contact, Additional (referralSource, tags).

### Frontend — Patient Detail Page

- [x] Create `src/routes/_app/_auth/dashboard/_layout.gabinet.patients.$patientId.tsx` with tabs: Overview (patient info cards), Activity (audit log). Appointments/Documents/Loyalty tabs can be placeholder stubs for later phases.

### Frontend — Treatment List Page

- [x] Create `src/routes/_app/_auth/dashboard/_layout.gabinet.treatments.index.tsx` with CrmDataTable showing columns: name, category, duration, price, isActive. Include SidePanel for create/edit.
- [x] Create treatment form component with fields: name, description, category, duration (minute picker), price, currency, taxRate, contraindications (textarea), preparation/aftercare instructions, color picker, isActive toggle.

### Navigation & Routing

- [x] Add Gabinet section to sidebar navigation (`src/components/layout/app-sidebar.tsx`) with collapsible group containing: Patients, Treatments. Only show when user's org has gabinet module active (check productSubscriptions or always show for now).
- [x] Ensure TanStack Router file-based routes are correctly set up for the new pages (gabinet namespace under dashboard layout).

### i18n

- [x] Add `gabinet.patients.*` translation keys to both `public/locales/en/translation.json` and `public/locales/pl/translation.json`. Keys needed: page title, column headers, form labels, empty state, create/edit/delete actions, validation messages.
- [x] Add `gabinet.treatments.*` translation keys to both translation files. Same scope as patients.

### Integration

- [x] Verify all new pages render without errors (no error boundaries triggered, no console errors on navigation).
- [x] Verify patient CRUD works end-to-end: create patient from list page, see in table, click to detail, edit, soft-delete.
- [x] Verify treatment CRUD works end-to-end: create treatment, see in table, edit, soft-delete.
- [x] Run typecheck (`npm run typecheck`) — must pass with 0 errors.
- [x] Run build (`npm run build`) — must succeed.
