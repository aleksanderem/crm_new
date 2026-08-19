-- Link stock movements to a specific treatment within an appointment (#5198).
--
-- When an appointment contains multiple treatments each treatment can consume
-- different products. Previously all movements shared the same source_type /
-- source_id pointing at the appointment, but there was no way to tell which
-- treatment within that appointment drove a given deduction.
--
-- treatment_id is nullable so that:
--   • existing movements without treatment context are unaffected,
--   • non-appointment movements (manual adjustments, direct sales, etc.) remain
--     valid without ever setting this field.

ALTER TABLE product_stock_movements
  ADD COLUMN IF NOT EXISTS treatment_id TEXT REFERENCES gabinet_treatments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS product_stock_movements_treatment_idx
  ON product_stock_movements (treatment_id)
  WHERE treatment_id IS NOT NULL;
