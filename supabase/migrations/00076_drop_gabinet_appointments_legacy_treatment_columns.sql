-- Drop deprecated scalar treatment columns from gabinet_appointments.
-- All treatment data has been migrated to the gabinet_appointment_treatments
-- junction table (00069_gabinet_appointment_treatments.sql, issue #3356).
-- All reads and writes have been updated to use the junction table.
-- Closes #3399.

ALTER TABLE gabinet_appointments
  DROP COLUMN IF EXISTS treatment_id,
  DROP COLUMN IF EXISTS price_at_booking,
  DROP COLUMN IF EXISTS variant_id;
