-- Denormalized total_value on warehouse_deliveries (#2968).
--
-- Stores the pre-computed SUM(quantity × unit_price) so the deliveries list
-- view can display the total without joining warehouse_delivery_items at
-- query time.  NULL means no line items carried a unit_price.
-- Existing rows stay NULL (no backfill; unit prices are optional anyway).

ALTER TABLE warehouse_deliveries ADD COLUMN IF NOT EXISTS total_value NUMERIC;
