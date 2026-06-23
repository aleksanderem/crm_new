-- Snapshot treatment price at booking time so revenue reports remain
-- auditable when treatment prices change later. NULL for appointments
-- created before this migration; the report falls back to the current
-- treatment price for those rows.
ALTER TABLE gabinet_appointments
  ADD COLUMN IF NOT EXISTS price_at_booking NUMERIC;
