-- Move stock_deducted and package_deducted tracking to the per-treatment
-- junction table (closes #3361).
--
-- The scalar stock_deducted / package_deducted columns on gabinet_appointments
-- are appointment-level booleans that made sense when each appointment had a
-- single treatment.  Now that gabinet_appointment_treatments holds one row per
-- treatment, a single boolean is ambiguous: it cannot say which treatments had
-- their stock or package entry deducted.
--
-- This migration:
--   1. Adds stock_deducted and package_deducted to gabinet_appointment_treatments.
--   2. Backfills the new columns from the parent appointment's flags so that
--      existing completed appointments remain consistent.
--
-- The appointment-level columns (stock_deducted, package_deducted) are left
-- in place for the current CAS guards in updateStatus — they will be removed
-- as a follow-up once the deduction logic migrates to per-treatment rows.

ALTER TABLE gabinet_appointment_treatments
  ADD COLUMN IF NOT EXISTS stock_deducted   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS package_deducted BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Backfill: propagate the appointment-level flags to the matching junction rows.
-- Only junction rows whose parent appointment already has the flag set get
-- marked true; new rows start at false (the column default).
-- ---------------------------------------------------------------------------

UPDATE gabinet_appointment_treatments jt
SET stock_deducted = true
FROM gabinet_appointments a
WHERE jt.appointment_id = a.id
  AND a.stock_deducted = true;

UPDATE gabinet_appointment_treatments jt
SET package_deducted = true
FROM gabinet_appointments a
WHERE jt.appointment_id = a.id
  AND a.package_deducted = true;
