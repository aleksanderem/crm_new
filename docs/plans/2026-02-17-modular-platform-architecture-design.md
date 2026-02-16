# Modular Platform Architecture Design

Date: 2026-02-17
Status: Approved
Session: S0010

## Vision

This project is not a CRM with plugins. It is a suite of vertical products (CRM, Gabinet, future: HVAC Service, Real Estate, etc.) built on a shared platform. Each product brings its own domain entities and business logic but connects to the platform through the same interfaces. The platform provides entity services (contacts, calendar, documents, custom fields, relationships, activity log, notes) that every product consumes automatically.

## Architecture Layers

```
+---------------------------------------------+
|              PRODUCTS (separate)             |
|  +----------+  +----------+  +----------+   |
|  |   CRM    |  | Gabinet  |  | Future   |   |
|  | (leads,  |  |(patients,|  |(devices, |   |
|  |pipelines,|  |treatments|  | orders,  |   |
|  |  deals)  |  | loyalty) |  |  parts)  |   |
|  +----+-----+  +----+-----+  +----+-----+   |
|       |              |              |        |
+-------+--------------+--------------+--------+
|           SHARED SERVICES                    |
|  calendar . contacts . companies . emails    |
|  documents . activities . custom fields      |
|  notes . relationships . saved views         |
+----------------------------------------------+
|           PLATFORM CORE                      |
|  auth . users . organizations . teams        |
|  billing/subscriptions . file storage        |
+----------------------------------------------+
```

### Platform Core (infrastructure, not a product)

auth, users, organizations, teamMemberships, billing/subscriptions (Stripe), file storage (_storage). Every product shares this. Not user-facing as a "product".

### Shared Services (usable by all products)

contacts, companies, documents, emails, scheduledActivities (calendar backbone), activities (audit log), customFieldDefinitions/Values, notes, objectRelationships, savedViews, sources, activityTypeDefinitions. These are the "toolkit" that every product consumes through the module contract.

### Products (separate, independently purchasable)

CRM: leads, pipelines, pipelineStages, dealProducts, products (sales catalog), calls, lostReasons.
Gabinet: gabinetPatients, gabinetTreatments, gabinetAppointments, gabinetEmployees, gabinetWorkingHours, gabinetEmployeeSchedules, gabinetLeaves, gabinetOvertime, gabinetLeaveTypes, gabinetLeaveBalances, gabinetTreatmentPackages, gabinetPackageUsage, gabinetLoyaltyPoints, gabinetLoyaltyTransactions, gabinetDocumentTemplates, gabinetDocuments, gabinetPortalSessions.

## Module Contract

### What a module MUST PROVIDE (registry)

Each module declares a registry file (`convex/<module>/_registry.ts`) containing:

1. Entity types: string identifiers for module's domain entities (e.g., "gabinetPatient", "gabinetTreatment"). These are registered in the platform's entityType system.

2. Activity types: calendar event types the module contributes (e.g., `{ key: "gabinet:appointment", name: "Wizyta", icon: "stethoscope", color: "#7C6AE8" }`).

3. Navigation entries: sidebar items with labels, hrefs, and icons for the module's pages.

4. Calendar renderers: mapping from activityType to detail panel component (e.g., `"gabinet:appointment" -> GabinetAppointmentDetail`).

### What a module GETS FOR FREE from the platform

After registering entityTypes, the module automatically has:

- Custom fields: users can add custom fields to any registered entity type via Settings > Custom Fields. Zero module code.
- Relationships: any module entity can be linked to contacts, companies, leads, or other entities. Core RelationshipPanel works with any entityType.
- Activity log: module calls `logActivity()` helper and activity timeline renders per-entity. Zero UI code in module.
- Notes: per-entity notes via NotesPanel component. Works with any entityType + entityId.
- Calendar: module creates scheduledActivity with its activityType and the event appears in the shared calendar. Click loads the renderer registered in calendarRenderers.
- Documents & emails: linked through relationships. EmailEntityTab and DocumentsPanel work with any entityType.
- Saved views: per entityType. Users can create saved views for module list pages without module code.
- CSV import/export: if module defines field mappings (which custom fields already do), import/export works generically.

### What a module must implement itself (domain logic)

- Its own tables and schema definitions
- Business logic (conflict checking, availability, package deduction, loyalty)
- Domain-specific validation
- List and form UI components for its entities
- Route files in `src/routes/`

### Boundary rule

Core handles everything that is entityType-agnostic (relationships, custom fields, notes, activity log). If logic requires knowledge of a module's data structure (e.g., "is this employee qualified for this treatment?"), it belongs in the module, not core.

## Calendar as Shared Service

### Backend: scheduledActivities as universal event backbone

scheduledActivities already has: title, dueDate, endDate, ownerId, activityType, linkedEntityType/Id, googleEventId/CalendarId, isCompleted, description.

New fields needed:
- `moduleRef`: optional object `{ moduleId: string, entityType: string, entityId: string }` — link to extension record in the module.
- `resourceId`: Id<"users"> — who is the "resource" for this event (the employee performing the treatment, the technician on-site). Distinct from ownerId (who created the event).

### Frontend: extract calendar UI from gabinet to shared

Move CalendarDayView, CalendarWeekView, CalendarMonthView from `src/components/gabinet/calendar/` to `src/components/calendar/`. These become generic components that accept an array of events (scheduledActivities) and callbacks (onEventClick, onSlotClick).

New shared route: `/dashboard/calendar` — shows all scheduledActivities for the organization.

Module-specific dialogs (AppointmentDialog for gabinet) remain in the module. Core calendar has a generic CalendarEventDialog for simple events (meeting, task, call). The create dialog switches based on selected activityType.

### Gabinet integration with shared calendar

When gabinet creates an appointment, it does a dual write in one mutation:
1. Insert gabinetAppointment (extension record with medical data)
2. Insert scheduledActivity with activityType "gabinet:appointment", resourceId = employeeId, moduleRef pointing to the appointment

Conflict checking reads both sources: gabinetAppointments for medical domain logic, scheduledActivities for general time blocking on the resource.

Working hours and employee schedules remain in gabinet (domain-specific). But the shared calendar can display "resource availability" if the module provides it — gabinet exports getAvailableSlots and checkConflict functions that core calendar can call when attempting to create an event on a module's resource.

## Product Subscription Model (Plan per Product)

### Data model changes

New table `productSubscriptions` (per organization, not per user):
- organizationId, productId (e.g., "crm", "gabinet"), stripeSubscriptionId, status, currentPeriodStart/End, cancelAtPeriodEnd

New table `platformProducts` (the product catalog for the platform itself):
- id: "crm" / "gabinet", name, description, prices (month/year, usd/eur)

### Access gating

Backend: `verifyProductAccess(ctx, organizationId, productId)` — checks active productSubscription. Every product function calls this alongside verifyOrgAccess.

Frontend: sidebar renders module sections based on active subscriptions. Routing guards redirect to upgrade page if module not active.

### Stripe compatibility

Existing free/pro flow can coexist. "Free" plan gives platform (contacts, calendar, docs). Each product is a separate Stripe subscription item. Checkout creates subscription for chosen product.

## Gabinet Completion (End-to-End)

### Gaps to close

1. Appointment <-> scheduledActivity link (dual write, currently missing)
2. Conflict checking against scheduledActivities (currently only checks gabinetAppointments)
3. Basic billing: payments table, mark appointment as paid, revenue report
4. Frontend completion: packages UI (purchase/assign), loyalty panel, medical documents with signature, patient detail completeness
5. Working hours correctly blocking calendar

### Basic billing model

New table `payments`:
- organizationId, patientId, appointmentId (optional), packageUsageId (optional), amount, currency, paymentMethod (cash/card/transfer), status (pending/completed/refunded), paidAt, createdBy, createdAt

On appointment completion: if not covered by package, create pending payment record. UI allows marking as paid. Revenue report aggregates completed payments by period.

## Testing Strategy

### Backend unit tests (priority)

- Conflict checking: double booking impossible, respects working hours, respects leaves, respects existing scheduledActivities
- Appointment state machine: VALID_TRANSITIONS enforced, cannot transition from terminal states
- Package deduction: correct count tracking, status transitions to "completed" when all used
- Availability slots: respects schedule, breaks, leaves, existing appointments, 15-min increments
- Product access gating: module functions reject when no active subscription

### E2E tests

- Create appointment flow: select patient, treatment, employee, time slot, confirm
- Calendar shared view: events from multiple modules visible
- Payment flow: complete appointment, mark as paid
- Multi-tenant: data isolation between organizations

## Implementation Phases

### Phase 1: Architecture Formalization (foundations)
- Reorganize schema (platform core, shared services, product tables)
- Create module registry pattern (_registry.ts per module)
- Add moduleRef and resourceId to scheduledActivities
- Add productSubscriptions and verifyProductAccess
- Migrate entityTypeValidator to dynamic registry

### Phase 2: Shared Calendar
- Move calendar UI components from gabinet to shared
- New shared route /dashboard/calendar
- Gabinet creates scheduledActivity on appointment create
- Conflict checking reads both sources

### Phase 3: Gabinet End-to-End
- Appointment <-> scheduledActivity dual write
- Complete frontend: packages, loyalty, medical documents
- Basic billing (payments table, paid status, revenue report)
- Working hours blocking calendar correctly

### Phase 4: Tests
- Backend unit tests: conflict checking, state machine, packages, availability, access gating
- E2E tests: appointment flow, calendar, payments

### Phase 5: Multi-tenant SaaS Launch
- Product subscription flow (Stripe checkout per product)
- Sidebar/routing gating per active subscriptions
- Onboarding flow with product selection
- Seed data and demo mode
