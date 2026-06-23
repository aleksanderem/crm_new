-- Products inventory fields (#2052).
--
-- Extends the products table with fields needed for warehouse management:
--
--   • min_stock      — minimum stock threshold; drives low-stock alerts and
--                      the "below minimum" filter / stats widget.
--   • manufacturer   — optional manufacturer / brand name.
--   • catalog_number — optional catalog / part number (distinct from sku,
--                      which is the internal sales code).
--   • stock_note     — internal warehouse note (storage instructions, etc.).
--
-- All columns are nullable so existing products are unaffected.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS min_stock NUMERIC;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS manufacturer TEXT;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS catalog_number TEXT;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_note TEXT;
