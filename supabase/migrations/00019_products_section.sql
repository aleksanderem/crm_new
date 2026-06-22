-- Products section (#2049).
--
-- Adds an organisational `product_section` column to the products table.
-- Products can belong to one of three sections:
--
--   • sale        — Produkty do sprzedaży (retail goods sold to clients)
--   • treatment   — Preparaty zabiegowe (preparations used during treatments)
--   • disposable  — Materiały jednorazowe (single-use consumables)
--
-- The column is nullable so that all existing products are unaffected.
-- No stock-level, movement, or inventory logic is added here.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_section TEXT;

CREATE INDEX IF NOT EXISTS products_section_idx
  ON products (organization_id, product_section)
  WHERE product_section IS NOT NULL;
