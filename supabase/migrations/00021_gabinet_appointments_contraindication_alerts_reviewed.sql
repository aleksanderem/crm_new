-- Add contraindication_alerts_reviewed flag to gabinet_appointments.
-- Lets staff mark that contraindications for a treatment have been reviewed
-- and discussed with the patient before the appointment proceeds.
ALTER TABLE gabinet_appointments
  ADD COLUMN IF NOT EXISTS contraindication_alerts_reviewed BOOLEAN;
