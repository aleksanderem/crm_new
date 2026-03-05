# PRD: Gabinet Phase 1 — Patients & Treatments

Foundation entities for clinic management. No external dependencies.

---

## 1. Schema — gabinetPatients table

**Location:** `convex/schema.ts`

Fields:
- `organizationId` — org scope
- `contactId?` — optional link to existing contacts table
- `firstName`, `lastName` — required
- `pesel?` — optional Polish ID
- `dateOfBirth?` — optional
- `gender?` — "male" | "female" | "other"
- `email` — required
- `phone?` — optional
- `address?` — `{ street, city, postalCode }`
- `medicalNotes?` — text
- `allergies?` — text
- `bloodType?` — string
- `emergencyContactName?`, `emergencyContactPhone?` — optional
- `referralSource?` — how they found us
- `referredByPatientId?` — link to another patient
- `isActive` — boolean, default true
- `tags?` — string[]
- `customFields?` — record (for platform custom fields integration)
- `createdBy`, `createdAt`, `updatedAt` — audit

Indexes:
- `by_org`
- `by_orgAndEmail`
- `by_orgAndPesel`
- `by_orgAndContact`

Search index: `firstName + lastName`, filtered by organizationId

- [x] Add `gabinetPatients` table to schema with all fields
- [x] Add indexes: by_org, by_orgAndEmail, by_orgAndPesel, by_orgAndContact
- [x] Add search index for firstName + lastName

---

## 2. Schema — gabinetTreatments table

**Location:** `convex/schema.ts`

Fields:
- `organizationId` — org scope
- `name` — required
- `description?` — optional text
- `category?` — string (e.g., "Massage", "Consultation")
- `duration` — minutes (number)
- `price` — number
- `currency` — default "PLN"
- `taxRate?` — optional percentage
- `requiredEquipment?` — string[]
- `contraindications?` — text
- `preparationInstructions?` — text
- `aftercareInstructions?` — text
- `isActive` — boolean, default true
- `requiresApproval?` — boolean
- `color?` — hex for calendar display
- `sortOrder?` — number for ordering
- `createdBy`, `createdAt`, `updatedAt` — audit

Indexes:
- `by_org`
- `by_orgAndCategory`
- `by_orgAndActive`

- [x] Add `gabinetTreatments` table to schema with all fields
- [x] Add indexes: by_org, by_orgAndCategory, by_orgAndActive

---

## 3. Backend — Patients API

**File:** `convex/gabinet/patients.ts`

Functions:
- `list` — paginated + search, filtered by org
- `getById` — single patient
- `create` — new patient, validate email uniqueness per org
- `update` — edit patient
- `remove` — soft-delete (set isActive=false)
- `getByContact` — find patient linked to contact
- `search` — autocomplete for dropdowns

All functions use `verifyOrgAccess` + `logActivity`.

- [x] Create `convex/gabinet/` directory
- [x] Create `convex/gabinet/patients.ts` with all CRUD functions
- [x] Add `logActivity` calls for audit trail
- [x] Run `npx convex codegen`

---

## 4. Backend — Treatments API

**File:** `convex/gabinet/treatments.ts`

Functions:
- `list` — paginated, filtered by org
- `getById` — single treatment
- `create` — new treatment
- `update` — edit treatment
- `remove` — soft-delete (set isActive=false)
- `listByCategory` — group by category
- `listActive` — non-paginated for dropdowns

- [x] Create `convex/gabinet/treatments.ts` with all CRUD functions
- [x] Add `logActivity` calls for audit trail
- [x] Run `npx convex codegen`

---

## 5. Frontend — Patient List Page

**File:** `src/routes/_app/_auth/dashboard/_layout.gabinet.patients.index.tsx`

Requirements:
- CrmDataTable with columns: name, email, phone, dateOfBirth, tags, createdAt
- SidePanel for create/edit
- SavedViews support
- Search bar with firstName/lastName search
- Filter by isActive status

- [x] Create patient list page with CrmDataTable
- [x] Add SidePanel for patient create/edit
- [x] Integrate SavedViews component
- [x] Add search functionality
- [x] Add isActive filter toggle

---

## 6. Frontend — Patient Detail Page

**File:** `src/routes/_app/_auth/dashboard/_layout.gabinet.patients.$patientId.tsx`

Tabs:
- Overview — patient info, medical notes, allergies, emergency contact
- Appointments — placeholder for Phase 3
- Documents — placeholder for Phase 5
- Loyalty — placeholder for Phase 4
- Activity — activity log via existing ActivityPanel

- [x] Create patient detail page with tab layout
- [x] Implement Overview tab with all patient fields
- [x] Add Activity tab using ActivityPanel component
- [x] Add placeholder tabs for future phases

---

## 7. Frontend — Treatment List Page

**File:** `src/routes/_app/_auth/dashboard/_layout.gabinet.treatments.index.tsx`

Requirements:
- CrmDataTable with columns: name, category, duration, price, isActive
- SidePanel for create/edit
- Category filter tabs
- Search by name

- [x] Create treatment list page with CrmDataTable
- [x] Add SidePanel for treatment create/edit
- [x] Add category filter tabs
- [x] Add search functionality

---

## 8. Frontend — Treatment Form Component

**File:** `src/components/gabinet/treatment-form.tsx`

Fields:
- name (required)
- description (textarea)
- category (text input with autocomplete)
- duration (number input, minutes)
- price (number input)
- currency (select, default PLN)
- color picker (hex color for calendar)
- isActive (toggle)
- requiresApproval (toggle)
- contraindications (textarea)
- preparationInstructions (textarea)
- aftercareInstructions (textarea)

- [x] Create treatment form component with all fields
- [x] Add color picker component
- [x] Add duration selector (minutes)
- [x] Add validation for required fields

---

## 9. Sidebar Navigation

**File:** `src/components/layout/app-sidebar.tsx`

Add collapsible "Gabinet" section:
- Patients (icon: Users)
- Treatments (icon: Stethoscope)
- Calendar (placeholder, disabled until Phase 3)
- Packages (placeholder, disabled until Phase 4)
- Documents (placeholder, disabled until Phase 5)

- [x] Add Gabinet collapsible section to sidebar
- [x] Add Patients navigation item
- [x] Add Treatments navigation item
- [x] Add placeholder items for future phases (disabled)

---

## 10. i18n Translations

**Files:** `src/i18n/locales/en/translation.json`, `src/i18n/locales/pl/translation.json`

Add keys:
- `gabinet.patients.*` — list, create, edit, fields, labels
- `gabinet.treatments.*` — list, create, edit, fields, labels
- `gabinet.sidebar.*` — navigation labels

- [x] Add English translations for gabinet.patients
- [x] Add English translations for gabinet.treatments
- [x] Add English translations for gabinet.sidebar
- [x] Add Polish translations for gabinet.patients
- [x] Add Polish translations for gabinet.treatments
- [x] Add Polish translations for gabinet.sidebar

---

## 11. Quick-Create Integration

**File:** `src/routes/_app/_auth/dashboard/_layout.tsx`

Add quick-create forms for:
- Patient — inline form with firstName, lastName, email, phone
- Treatment — redirect to full form (too many fields for inline)

- [x] Add Patient to quick-create entityItems
- [x] Create inline patient form (firstName, lastName, email, phone)
- [x] Add Treatment to quick-create entityItems (navigate to treatment form)
- [x] Update quick-create renderForm switch

---

## 12. Typecheck & Build Verification

- [x] Run `npm run typecheck` — must pass with 0 errors
- [x] Run `npm run build` — must succeed
- [x] Verify no new linting errors

---

## 13. E2E Verification

- [x] Patients page loads without error
- [x] Can create new patient via SidePanel
- [x] Can edit patient via SidePanel
- [x] Can search patients by name
- [x] Treatments page loads without error
- [x] Can create new treatment via SidePanel
- [x] Can edit treatment via SidePanel
- [x] Gabinet sidebar section visible and navigable
- [x] Quick-create patient form works

---

## Notes

- All tables follow CRM conventions: `organizationId`, `createdBy`, `createdAt`/`updatedAt`, `verifyOrgAccess`
- Soft-delete pattern: set `isActive=false` instead of hard delete
- Use existing `logActivity` helper for audit trail
- Custom fields integration comes from platform (entityType registration in future phase)
