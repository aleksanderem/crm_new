-- Issue #4621: separate "performs services" from "visible in calendar" on employees
--
-- Previously, service-related fields (specialization, licenseNumber,
-- qualifiedTreatments) were gated in the UI by the employee role. This column
-- makes it an explicit, independent boolean the admin sets per employee.
-- Defaults to TRUE so existing rows keep current behaviour.

ALTER TABLE gabinet_employees
  ADD COLUMN IF NOT EXISTS performs_services BOOLEAN NOT NULL DEFAULT TRUE;
