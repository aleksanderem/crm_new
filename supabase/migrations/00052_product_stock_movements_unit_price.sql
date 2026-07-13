-- Snapshot unit_price into stock movements at receipt time (#2963).
--
-- Adds an optional unit_price column to product_stock_movements so the
-- purchase price at the moment of a warehouse receipt (or any other inbound
-- movement) is preserved even after the product's purchase_price field is
-- updated.  For warehouse-delivery postings the value comes from the delivery
-- item's unit_price; if that is absent the product's current purchase_price
-- is used as the fallback.  All other movement types (manual adjustments,
-- appointment use, etc.) leave the column NULL unless the caller supplies it.

ALTER TABLE product_stock_movements
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC;
