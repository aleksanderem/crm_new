-- Store which treatment a package covers in a multi-treatment appointment (closes #3590).
--
-- When booking a multi-treatment appointment with a package, the frontend sends
-- packageTreatmentId to identify which of the N treatments is covered.
-- Previously the backend declared the field in the validator but never persisted it,
-- so at completion time the package deduction loop set package_deducted=true on ALL
-- junction rows rather than only the one covered by the package.
--
-- This migration adds the column so appointments.create can persist the value and
-- updateStatus can filter its deduction/return loops accordingly.

ALTER TABLE gabinet_appointments
  ADD COLUMN IF NOT EXISTS package_treatment_id TEXT REFERENCES gabinet_treatments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gabinet_appointments_package_treatment_id_idx
  ON gabinet_appointments (organization_id, package_treatment_id)
  WHERE package_treatment_id IS NOT NULL;
