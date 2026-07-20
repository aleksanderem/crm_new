-- Add sale_price field to products (#3201, #3203).
--
-- Optional retail sale price per unit for sellable warehouse products.
-- Nullable so existing products are unaffected. Data-layer only — the form,
-- table columns and validation wiring are follow-ups per the #3203 micro-task
-- scoping. Mirrors the purchase_price pattern from migration 00050.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sale_price NUMERIC;
