-- Add composite index on product_stock_movements for the historical snapshot
-- query in the inventory dialog (#2950).
--
-- The historical view queries:
--   WHERE organization_id = ? AND location_id = ? AND created_at <= ?
--   ORDER BY created_at DESC
--
-- The existing (organization_id, created_at DESC) index leaves location_id
-- as a post-scan filter, making the query O(n) in org movement history.
-- This covering index makes it O(log n).

CREATE INDEX IF NOT EXISTS product_stock_movements_org_location_created_idx
  ON product_stock_movements (organization_id, location_id, created_at DESC);
