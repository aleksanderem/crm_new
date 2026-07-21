-- Drop appointment-level stock_deducted and package_deducted columns from
-- gabinet_appointments. The deduction guard was migrated to per-treatment rows
-- in gabinet_appointment_treatments (00070_appointment_treatments_deduction_flags.sql).
-- The per-treatment CAS replaced the per-appointment CAS in issues #3366 and #3367.
-- Closes #3368.

ALTER TABLE gabinet_appointments
  DROP COLUMN IF EXISTS stock_deducted,
  DROP COLUMN IF EXISTS package_deducted;
