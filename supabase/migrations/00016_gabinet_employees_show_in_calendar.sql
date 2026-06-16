-- Issue #1859: per-employee calendar visibility toggle
--
-- Allows an admin to hide a non-clinical employee (e.g. office manager, admin)
-- from the day-by-employee calendar columns while keeping the profile active
-- for HR / payroll. Defaults to TRUE so existing rows keep current behavior.

ALTER TABLE gabinet_employees
  ADD COLUMN IF NOT EXISTS show_in_calendar BOOLEAN NOT NULL DEFAULT TRUE;
