-- LOT batch tracking (#2989).
--
-- Adds lot_number and expiry_date to both warehouse_delivery_items (source)
-- and product_stock_movements (audit trail). Both fields are optional so
-- that existing deliveries and movements without LOT data are unaffected.
--
-- Duplicate-LOT guard is enforced in the backend per-delivery, not at the DB
-- level, per the issue spec: the same LOT can appear in different deliveries.

ALTER TABLE warehouse_delivery_items
  ADD COLUMN IF NOT EXISTS lot_number   TEXT,
  ADD COLUMN IF NOT EXISTS expiry_date  TEXT;  -- ISO date YYYY-MM-DD

ALTER TABLE product_stock_movements
  ADD COLUMN IF NOT EXISTS lot_number   TEXT,
  ADD COLUMN IF NOT EXISTS expiry_date  TEXT;  -- ISO date YYYY-MM-DD

-- Index to efficiently aggregate active batches by product + lot
CREATE INDEX IF NOT EXISTS product_stock_movements_lot_idx
  ON product_stock_movements (organization_id, product_id, lot_number)
  WHERE lot_number IS NOT NULL;
