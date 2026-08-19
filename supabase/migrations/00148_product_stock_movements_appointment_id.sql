-- Link direct-sale stock movements to an appointment (#5601).
--
-- Clinics often sell products (creams, supplements, etc.) to patients at the
-- time of a visit. Previously `sellProductStandalone` stored the client as
-- `source_id` but had no column to capture which appointment the sale happened
-- during. This column fills that gap.
--
-- appointment_id is nullable so that:
--   • existing movements without an appointment context are unaffected,
--   • non-appointment direct sales (counter sales, online orders, etc.) remain
--     valid without ever setting this field.

ALTER TABLE product_stock_movements
  ADD COLUMN IF NOT EXISTS appointment_id TEXT REFERENCES gabinet_appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS product_stock_movements_appointment_idx
  ON product_stock_movements (appointment_id)
  WHERE appointment_id IS NOT NULL;
