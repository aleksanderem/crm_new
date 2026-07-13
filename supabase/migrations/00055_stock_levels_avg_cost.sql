-- Weighted-average net purchase price per (product, location) (#2977).
--
-- avg_cost is NULL until the first warehouse delivery with a net unit price is
-- posted for a given (product, location) pair. It is recomputed by the backend
-- each time a delivery is posted using the formula:
--
--   new_avg = (prev_qty × prev_avg + incoming_qty × unit_price_net)
--             ÷ (prev_qty + incoming_qty)
--
-- When prev_qty ≤ 0 or prev_avg IS NULL the new delivery price replaces the
-- average outright (avoids dividing by zero and resets a negative-stock base).
--
-- Intentionally NOT updated on manual adjustments or inventory reconciliations
-- per issue #2977 scope guardrails.

ALTER TABLE product_stock_levels
  ADD COLUMN IF NOT EXISTS avg_cost NUMERIC;
