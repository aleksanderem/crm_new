-- Drop orphaned column removed from application code in issue #3678.
-- The per-org JSON blob approach for appointment notifications was never wired up
-- (dispatchAppointmentCreated was never called); notification dispatch is handled
-- entirely by the automation engine (convex/automation.ts).
ALTER TABLE org_settings DROP COLUMN IF EXISTS appointment_workflow_config;
