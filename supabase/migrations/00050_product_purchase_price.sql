-- Add purchase_price field to products (#2956).
--
-- Extends the products table with an optional gross purchase price per unit.
-- Used to calculate warehouse value (stock × purchase_price) in the accountant
-- stock report. Nullable so existing products are unaffected.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS purchase_price NUMERIC;
