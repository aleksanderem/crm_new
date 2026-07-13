-- Delivery items: gross price, line values, VAT code (#2975).
--
-- Extends warehouse_delivery_items with:
--   • unit_price_gross  — gross unit price (netto × (1 + VAT/100))
--   • line_value_net    — qty × unit_price, computed at save time
--   • line_value_gross  — qty × unit_price_gross, computed at save time
--   • vat_code          — human-readable VAT code: "23"|"8"|"5"|"0"|"zw"|"np"
--
-- Extends warehouse_deliveries with:
--   • total_value_gross — pre-computed SUM(line_value_gross) across all items
--
-- The existing unit_price (net) and total_value (net) columns are unchanged.
-- For "zw." and "np." codes unit_price_gross = unit_price (no VAT added).

ALTER TABLE warehouse_delivery_items
  ADD COLUMN IF NOT EXISTS unit_price_gross NUMERIC,
  ADD COLUMN IF NOT EXISTS line_value_net   NUMERIC,
  ADD COLUMN IF NOT EXISTS line_value_gross NUMERIC,
  ADD COLUMN IF NOT EXISTS vat_code         TEXT;

ALTER TABLE warehouse_deliveries
  ADD COLUMN IF NOT EXISTS total_value_gross NUMERIC;
