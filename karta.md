# Plan: Gabinet Module — Full Karta Feature Port for CRM

## Context

The user wants to port the entire Karta clinic management system (a Laravel/Filament SaaS at /Users/alex/Herd/karta) into the existing Convex/React CRM as a "Gabinet" module. Karta handles patient management, appointment scheduling with recurring support, treatment catalog with packages, medical documents with digital signatures, employee scheduling (working hours, leaves, overtime), and a loyalty points system.

The user confirmed: full port of all features, a separate /patient auth zone with its own layout for patient portal access, a full calendar with conflict detection and day/week/month views, and asked me to design optimal implementation phasing.

All new tables follow existing CRM conventions: `organizationId` scoping, `createdBy` audit, `createdAt`/`updatedAt` timestamps, `verifyOrgAccess`/`requireOrgAdmin` auth, `logActivity` audit trails.

---

## Phase 1: Patients & Treatments (Foundation)

Core entities referenced by everything else. No external dependencies.

### 1.1 Schema — `gabinetPatients` table (`convex/schema.ts`)

```
organizationId, contactId? (optional link to existing contacts),
firstName, lastName, pesel?, dateOfBirth?, gender? ("male"|"female"|"other"),
email, phone?, address? ({ street, city, postalCode }),
medicalNotes?, allergies?, bloodType?,
emergencyContactName?, emergencyContactPhone?,
referralSource?, referredByPatientId?,
isActive (boolean, default true),
tags? (string[]), customFields? (record),
createdBy, createdAt, updatedAt
```
Indexes: `by_org`, `by_orgAndEmail`, `by_orgAndPesel`, `by_orgAndContact`
Search index: firstName + lastName, filtered by organizationId

### 1.2 Schema — `gabinetTreatments` table

```
organizationId, name, description?,
category? (string), duration (minutes), price, currency (default "PLN"),
taxRate?, requiredEquipment? (string[]),
contraindications?, preparationInstructions?, aftercareInstructions?,
isActive (boolean, default true), requiresApproval? (boolean),
color? (hex for calendar), sortOrder?,
createdBy, createdAt, updatedAt
```
Indexes: `by_org`, `by_orgAndCategory`, `by_orgAndActive`

### 1.3 Backend

`convex/gabinet/patients.ts` — list (paginated + search), getById, create, update, remove (soft-delete), getByContact, search. All use `verifyOrgAccess` + `logActivity`.

`convex/gabinet/treatments.ts` — list, getById, create, update, remove, listByCategory, listActive (non-paginated for dropdowns).

### 1.4 Frontend — Patient Pages

`src/routes/_app/_auth/dashboard/_layout.gabinet.patients.index.tsx` — CrmDataTable with columns (name, email, phone, dateOfBirth, tags, createdAt), SidePanel for create/edit, SavedViews support.

`src/routes/_app/_auth/dashboard/_layout.gabinet.patients.$patientId.tsx` — Detail page with tabs: Overview, Appointments (Phase 3), Documents (Phase 5), Loyalty (Phase 4), Activity.

### 1.5 Frontend — Treatment Pages

`src/routes/_app/_auth/dashboard/_layout.gabinet.treatments.index.tsx` — CrmDataTable, SidePanel, category filter tabs.

`src/components/gabinet/treatment-form.tsx` — Form with all fields, color picker, duration selector.

### 1.6 Sidebar Navigation

Modify `src/components/layout/sidebar.tsx` — add collapsible "Gabinet" section with sub-items: Patients, Treatments, Calendar (Phase 3), Packages (Phase 4), Documents (Phase 5).

### 1.7 i18n

Add `gabinet.patients.*` and `gabinet.treatments.*` to both `en/translation.json` and `pl/translation.json`.

---

## Phase 2: Employee Scheduling

Required before Appointments (Phase 3) for availability calculation. Uses existing users table.

### 2.1 Schema — 4 new tables

`gabinetWorkingHours` — clinic-level defaults per day of week:
```
organizationId, dayOfWeek (0-6), startTime ("HH:MM"), endTime ("HH:MM"),
isOpen (boolean), breakStart?, breakEnd?, createdBy, createdAt, updatedAt
```

`gabinetEmployeeSchedules` — per-employee overrides:
```
organizationId, userId, dayOfWeek (0-6),
startTime, endTime, isWorking (boolean), breakStart?, breakEnd?,
effectiveFrom?, effectiveTo?, createdBy, createdAt, updatedAt
```

`gabinetLeaves` — time off:
```
organizationId, userId, type ("vacation"|"sick"|"personal"|"training"|"other"),
startDate, endDate, startTime?, endTime?,
status ("pending"|"approved"|"rejected"), reason?,
approvedBy?, approvedAt?, createdBy, createdAt, updatedAt
```

`gabinetOvertime`:
```
organizationId, userId, date, hours, reason?,
status ("pending"|"approved"|"rejected"),
approvedBy?, approvedAt?, createdBy, createdAt, updatedAt
```

### 2.2 Backend

`convex/gabinet/scheduling.ts` — getWorkingHours, setWorkingHours, bulkSetWorkingHours, getEmployeeSchedule, setEmployeeSchedule, listEmployeeSchedules.

Leaves: listLeaves, createLeave, approveLeave, rejectLeave, getLeavesByDateRange.

`convex/gabinet/_availability.ts` (internal helper):
- `getAvailableSlots(ctx, { organizationId, userId, date, duration })` — gets employee schedule (or clinic defaults), subtracts leaves + existing appointments, returns available time slots.
- `checkConflict(ctx, { organizationId, userId, date, startTime, endTime, excludeAppointmentId? })` — returns `{ hasConflict, reason? }`.

### 2.3 Frontend

`src/routes/_app/_auth/dashboard/_layout.gabinet.settings.scheduling.tsx` — 7-row working hours table with time pickers + employee schedule overrides.

`src/routes/_app/_auth/dashboard/_layout.gabinet.settings.leaves.tsx` — CrmDataTable with approve/reject actions for admins, create leave dialog.

---

## Phase 3: Appointments & Calendar

Depends on Phase 1 (patients, treatments) and Phase 2 (availability engine).

### 3.1 Schema — `gabinetAppointments` table

```
organizationId, patientId, treatmentId, employeeId (userId),
date (YYYY-MM-DD), startTime ("HH:MM"), endTime ("HH:MM"),
status ("scheduled"|"confirmed"|"in_progress"|"completed"|"cancelled"|"no_show"),
notes?, internalNotes?, color?,

// Recurring
isRecurring (boolean), recurringRule? ({ frequency, count?, until? }),
recurringGroupId?, recurringIndex?,

// Prepayment
prepaymentRequired?, prepaymentAmount?, prepaymentStatus?, prepaymentPaidAt?,

// Package link
packageUsageId?,

// Cancellation
cancelledAt?, cancelledBy?, cancellationReason?,

createdBy, createdAt, updatedAt
```
Indexes: `by_org`, `by_orgAndDate`, `by_orgAndPatient`, `by_orgAndEmployee`, `by_orgAndEmployeeAndDate`, `by_orgAndStatus`, `by_orgAndRecurringGroup`

### 3.2 Backend — `convex/gabinet/appointments.ts`

- list, getById, listByDate, listByDateRange — various query patterns for calendar views
- create — validates via checkConflict, generates recurring series if isRecurring
- update — conflict validation (excluding self), option to update single or all future in series
- updateStatus — validates status transitions (e.g., can't go cancelled→in_progress)
- cancel, cancelRecurringSeries — status + reason + prepayment handling

`convex/gabinet/appointments_helpers.ts` — generateRecurringDates, validateStatusTransition (internal).

### 3.3 Frontend — Calendar

`src/routes/_app/_auth/dashboard/_layout.gabinet.calendar.index.tsx` — Full calendar with day/week/month switcher, employee filter, date navigation.

`src/components/gabinet/calendar/calendar-day-view.tsx` — Time grid with appointment blocks, break indicators, leave overlays, current time line, click-to-create.

`src/components/gabinet/calendar/calendar-week-view.tsx` — 7-column grid, compact blocks, employee columns mode.

`src/components/gabinet/calendar/calendar-month-view.tsx` — Month grid, day cells with appointment counts, click-to-navigate.

`src/components/gabinet/calendar/appointment-dialog.tsx` — Patient selector, treatment selector (grouped by category), employee selector, available slot picker (from availability engine), recurring options, prepayment toggle, conflict warnings.

`src/components/gabinet/calendar/appointment-card.tsx` — Compact card for calendar display.

### 3.4 Patient Detail Integration

Add "Appointments" tab to patient detail: upcoming/past lists, quick schedule button.

---

## Phase 4: Treatment Packages & Loyalty

Depends on Phase 1 (treatments) and Phase 3 (appointments for package usage tracking).

### 4.1 Schema — 4 new tables

`gabinetTreatmentPackages`:
```
organizationId, name, description?,
treatments (array of { treatmentId, quantity }),
totalPrice, currency, discountPercent?, validityDays?,
isActive, loyaltyPointsAwarded?, createdBy, createdAt, updatedAt
```

`gabinetPackageUsage`:
```
organizationId, patientId, packageId,
purchasedAt, expiresAt?, status ("active"|"completed"|"expired"|"cancelled"),
treatmentsUsed (array of { treatmentId, usedCount, totalCount }),
paidAmount, paymentMethod?, createdBy, createdAt, updatedAt
```

`gabinetLoyaltyPoints`:
```
organizationId, patientId, balance, lifetimeEarned, lifetimeSpent,
tier? ("bronze"|"silver"|"gold"|"platinum"), createdAt, updatedAt
```

`gabinetLoyaltyTransactions`:
```
organizationId, patientId, type ("earn"|"spend"|"adjust"|"expire"),
points, reason, referenceType?, referenceId?, balanceAfter,
createdBy, createdAt
```

### 4.2 Backend

`convex/gabinet/packages.ts` — CRUD + purchasePackage, usePackageTreatment, getPatientPackages.

`convex/gabinet/loyalty.ts` — getBalance, getTransactions, earnPoints, spendPoints, adjustPoints.

Appointment integration: when status→completed, award loyalty points + deduct from package if linked.

### 4.3 Frontend

`src/routes/_app/_auth/dashboard/_layout.gabinet.packages.index.tsx` — CrmDataTable, SidePanel with dynamic treatment list builder.

Patient detail: "Packages" tab with usage progress bars, "Loyalty" tab with balance/tier/transactions/manual adjust.

Appointment dialog: option to link to active package.

---

## Phase 5: Medical Documents & Signatures

Depends on Phase 1 (patients) and Phase 3 (documents linked to appointments).

### 5.1 Schema — 2 new tables

`gabinetDocumentTemplates`:
```
organizationId, name, type ("consent"|"medical_record"|"prescription"|"referral"|"custom"),
content (rich text with placeholders like {{patient.firstName}}),
requiresSignature, isActive, sortOrder?, createdBy, createdAt, updatedAt
```

`gabinetDocuments`:
```
organizationId, patientId, appointmentId?, templateId?,
title, type, content (rendered), status ("draft"|"pending_signature"|"signed"|"archived"),
signatureData? (base64), signedAt?, signedByPatient?, signedByEmployee?,
fileStorageId?, fileName?, fileMimeType?,
createdBy, createdAt, updatedAt
```

### 5.2 Backend

`convex/gabinet/documentTemplates.ts` — CRUD.

`convex/gabinet/documents.ts` — list, getById, create (renders template with patient data), update, requestSignature, sign, archive, generatePdf, getByAppointment.

### 5.3 Frontend

`src/routes/_app/_auth/dashboard/_layout.gabinet.documents.index.tsx` — CrmDataTable with type/status filters.

`src/components/gabinet/documents/document-editor.tsx` — Rich text editor with placeholder toolbar.

`src/components/gabinet/documents/signature-pad.tsx` — Canvas-based, touch+mouse, base64 output.

`src/components/gabinet/documents/document-viewer.tsx` — Content + signature display, PDF download.

`src/routes/_app/_auth/dashboard/_layout.gabinet.settings.document-templates.tsx` — Template management.

Integration: patient detail "Documents" tab, appointment detail linked documents.

---

## Phase 6: Patient Portal

Depends on Phases 1, 3, 5. Exposes existing data through a separate interface.

### 6.1 Patient Auth

Separate from main CRM auth. Patients authenticate with email + OTP via Resend.

`convex/gabinet/patientAuth.ts` — sendPortalOtp, verifyPortalOtp, getPortalSession, logoutPortal.

Schema — `gabinetPortalSessions`:
```
patientId, organizationId, tokenHash, otpHash?, otpExpiresAt?,
isActive, lastAccessedAt, createdAt, expiresAt
```

### 6.2 Frontend — Patient Route Tree

Entirely separate from `/_auth/dashboard/`:

`src/routes/_app/patient/_layout.tsx` — Simplified layout: logo, patient name, top tab navigation, logout. Session validation.

`src/routes/_app/patient/login.tsx` — Email + OTP login, Polish-first with language switcher.

`src/routes/_app/patient/_layout.index.tsx` — Dashboard: next appointment, quick stats.

`src/routes/_app/patient/_layout.appointments.tsx` — Upcoming + past appointments (read-only).

`src/routes/_app/patient/_layout.treatments.tsx` — Treatment history, active packages, loyalty balance.

`src/routes/_app/patient/_layout.documents.tsx` — Sign pending documents, view signed ones, download PDFs.

`src/routes/_app/patient/_layout.profile.tsx` — Edit phone, address, emergency contact (not medical fields).

### 6.3 Backend — Patient-Scoped Queries

`convex/gabinet/patientPortal.ts` — getMyAppointments, getMyDocuments, getMyPackages, getMyLoyaltyBalance, getMyProfile, updateMyProfile, signDocument. All validate patient session instead of org access.

---

## Phase 7: Polish & Advanced Features

### 7.1 Gabinet Dashboard

`src/routes/_app/_auth/dashboard/_layout.gabinet.index.tsx` — Today's appointments, week stats, pending leave requests, revenue summary.

### 7.2 Appointment Reminders

`convex/gabinet/reminders.ts` — Convex cron: daily, finds tomorrow's appointments, sends reminder emails via Resend.

### 7.3 Reporting

`src/routes/_app/_auth/dashboard/_layout.gabinet.reports.tsx` — Treatment popularity, revenue by period, employee utilization, patient retention, package sales.

### 7.4 Treatment Approval Workflow

For treatments with `requiresApproval: true`: appointment creates approval request, admin approves before "confirmed" status.

### 7.5 Advanced Calendar

Drag-and-drop rescheduling, Google Calendar sync (via existing Phase H OAuth infrastructure), print schedule, employee color coding.

---

## Implementation Order

```
Phase 1 — Patients & Treatments .......... ~3 sessions
Phase 2 — Employee Scheduling ............ ~2 sessions
Phase 3 — Appointments & Calendar ........ ~4 sessions
Phase 4 — Packages & Loyalty ............. ~2 sessions
Phase 5 — Medical Documents .............. ~2 sessions
Phase 6 — Patient Portal ................. ~2 sessions
Phase 7 — Polish & Advanced .............. ~2 sessions
```

Parallelizable with teams: backend + frontend agents per phase.

---

## Critical Files

### New Backend Files (convex/gabinet/)
| File | Purpose |
|------|---------|
| `patients.ts` | Patient CRUD |
| `treatments.ts` | Treatment CRUD |
| `scheduling.ts` | Working hours, schedules, leaves |
| `_availability.ts` | Availability engine (internal) |
| `appointments.ts` | Appointment CRUD + recurring |
| `appointments_helpers.ts` | Recurring generation, status validation |
| `packages.ts` | Treatment packages + usage |
| `loyalty.ts` | Loyalty points + transactions |
| `documentTemplates.ts` | Document template CRUD |
| `documents.ts` | Document CRUD + signature |
| `patientAuth.ts` | Patient portal authentication |
| `patientPortal.ts` | Patient-scoped queries |
| `reminders.ts` | Appointment reminder cron |

### New Frontend Files
| File | Purpose |
|------|---------|
| `gabinet.patients.index.tsx` | Patient list |
| `gabinet.patients.$patientId.tsx` | Patient detail |
| `gabinet.treatments.index.tsx` | Treatment list |
| `gabinet.calendar.index.tsx` | Full calendar |
| `gabinet.packages.index.tsx` | Package list |
| `gabinet.documents.index.tsx` | Document list |
| `gabinet.settings.scheduling.tsx` | Scheduling settings |
| `gabinet.settings.leaves.tsx` | Leave management |
| `gabinet.settings.document-templates.tsx` | Template management |
| `gabinet.reports.tsx` | Reports |
| `gabinet.index.tsx` | Gabinet dashboard |
| `patient/_layout.tsx` + pages | Patient portal (7 files) |
| `components/gabinet/calendar/*` | Calendar views (5 files) |
| `components/gabinet/documents/*` | Document editor, signature, viewer |
| `components/gabinet/treatment-form.tsx` | Treatment form |
| `components/gabinet/package-form.tsx` | Package form |

### Modified Files
| File | Change |
|------|--------|
| `convex/schema.ts` | Add all gabinet* tables (~12 tables) |
| `src/components/layout/sidebar.tsx` | Add Gabinet nav section |
| `public/locales/en/translation.json` | Add gabinet.* + patientPortal.* keys |
| `public/locales/pl/translation.json` | Add gabinet.* + patientPortal.* keys |

---

## Verification

Phase 1: Create patient, verify list + detail + search. Create treatment with category/pricing, verify list.

Phase 2: Set working hours, create employee schedule override, request + approve leave. Verify availability engine returns correct slots (empty during leaves, respects breaks).

Phase 3: Open calendar in day/week/month views. Create appointment via empty slot click. Conflict detection prevents double-booking. Recurring generates correct series. Status transitions validated. Patient detail shows appointments.

Phase 4: Create package with 3 treatments. Purchase for patient. Complete linked appointment — usage decrements, loyalty points awarded.

Phase 5: Create template with placeholders. Generate document for patient. Signature pad captures signature. Signed document displays correctly. PDF download works.

Phase 6: /patient/login with OTP. Dashboard shows upcoming appointments. Can sign pending documents. Can edit profile (phone/address). Cannot access main CRM routes.

Phase 7: Dashboard shows today's stats. Reminder cron fires. Reports display correct charts.
