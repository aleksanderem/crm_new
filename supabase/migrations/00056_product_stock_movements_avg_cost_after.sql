-- Snapshot weighted-average cost into each stock movement (#2980).
--
-- avg_cost_after captures the per-(product, location) weighted-average net
-- purchase price *after* this movement is applied.  It is only set for
-- warehouse_receive movements (the only reason that updates avg cost); all
-- other movement types leave it NULL because they do not change the running
-- average.
--
-- Storing the value here (rather than only in product_stock_levels) lets the
-- accountant report reconstruct historically-accurate valuations: given a
-- historical date, take the most-recent non-NULL avg_cost_after for each
-- (product, location) pair up to that date.

ALTER TABLE product_stock_movements
  ADD COLUMN IF NOT EXISTS avg_cost_after NUMERIC;
