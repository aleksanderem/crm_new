-- Add dedicated payment_method column to product_stock_movements.
-- Previously, payment method was stored in the free-text `note` column which
-- makes reporting on payment breakdown impossible. This column is nullable so
-- existing movements (appointment use, warehouse receipts, etc.) remain valid.
ALTER TABLE product_stock_movements
  ADD COLUMN payment_method TEXT;
