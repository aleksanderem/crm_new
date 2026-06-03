# Gabinet Module — module context

This file gives any agent enough context to work on Gabinet (clinic management) code.

## What Gabinet users do

Clinic staff (receptionist, doctor, nurse) managing patient visits. Daily workflow: check today's appointments on calendar, book new appointments, manage patient records, create medical documents (consent forms, prescriptions), process payments, track treatment packages and loyalty points. Patients access a self-service portal to view appointments and documents.

## Ownership

Gabinet owns: patients, treatments, appointments, employees, scheduling (working hours, leaves), packages, loyalty, patient portal, appointment reminders.

## Key files

Backend:
- convex/gabinet/patients.ts — patient CRUD (linked to CRM contacts via contactId)
- convex/gabinet/treatments.ts — treatment catalog
- convex/gabinet/appointments.ts — appointment lifecycle (book, confirm, start, complete, cancel, no-show)
- convex/gabinet/employees.ts — staff records linked to users
- convex/gabinet/workingHours.ts — org-wide working hours
- convex/gabinet/employeeSchedules.ts — per-employee schedules
- convex/gabinet/leaves.ts — leave requests and approvals
- convex/gabinet/packages.ts — treatment bundles
- convex/gabinet/loyalty.ts — points and tiers
- convex/gabinet/documents.ts — gabinet document operations
- convex/gabinet/documentDataSources.ts — gabinet data sources (patient, employee, appointment)
- convex/gabinet/patientAuth.ts — patient portal OTP auth

Frontend:
- src/routes/_app/_auth/dashboard/_layout.gabinet.* — all gabinet pages
- src/routes/_app/patient/ — patient portal (separate auth flow)
- src/components/gabinet/ — gabinet components (calendar, appointment dialog, body chart, signature pad)

## Appointment flow

Book (select patient + treatment + employee + date/time from available slots) -> Scheduled -> Confirmed -> In Progress -> Completed. Can cancel or mark no-show at any point. Appointments auto-calculate end time from treatment duration. Recurring appointments supported.

## Current gaps (from user perspective)

1. No appointment reminders (schema exists but no send logic or config UI)
2. Patient portal is read-only for appointments — no self-booking
3. No patient appointment confirmation from portal
4. No waiting list when no slots available
5. No export of schedule or patient list (CSV/PDF)
6. No detailed reports (revenue by treatment, staff utilization, popular time slots)
7. No inventory/supplies tracking
8. No insurance billing integration
9. Two document systems coexist — gabinetDocuments (old) and documentInstances (new). Migration script exists but hasn't been run.

## Integration points with platform

- Patients link to CRM contacts via contactId field.
- Documents: gabinet entities register as data sources (patient, employee, appointment). Templates filtered by module="gabinet".
- Activities: appointment actions logged to activities table.
- Search: patients and treatments indexed in global search (reads hit Supabase via the `use-supabase-*` hook family).
- Scheduling: appointments create scheduledActivities for unified calendar.
- Notifications: appointment status changes generate notifications.

## Data layer (Supabase-primary as of 2026-04)

Gabinet follows the platform read/write split: the browser reads from self-hosted Supabase Postgres via `supabase-js` and the `src/hooks/use-supabase-*.ts` family; writes go through Convex mutations in `convex/gabinet/*.ts` (appointments, patients, employees, schedules, etc.), which persist to Supabase via `convex/_helpers/supabaseDb.ts → createSupabaseDb()`. The patient portal (`src/routes/_app/patient/`) shares the same Supabase JWT bridge — `convex/supabase/jwt.ts → mintSupabaseToken` — under its own auth flow.

`convex/schema.ts` remains the structural source of truth for `gabinet*` tables, but production query indexes live in `supabase/migrations/` — add any new index for a gabinet query there too, not just to the Convex schema. The Convex (camelCase) ↔ Supabase (snake_case) table-name mapping is `TABLE_MAP` in `convex/_helpers/supabaseDb.ts`. If a `convex/gabinet/*` file or comment still calls Convex "the database" without mentioning Supabase, treat it as pre-2026-04 and trust the code. See the "Migration note" in `CLAUDE.md`.
