-- Gabinet treatment → product junction table (#2318).
--
-- Stores the standard "inventory recipe" for a treatment definition:
-- which products from the Magazyn (warehouse) are typically consumed
-- during a single visit of this treatment, and in what quantity.
--
-- Two item types are supported via `product_section`, matching the
-- existing product_section values on the products table:
--
--   • treatment   — Preparaty zabiegowe (preparations / serums)
--   • disposable  — Materiały jednorazowe (single-use consumables)
--
-- `unit` is a snapshot of products.stock_unit at link time. Snapshots are
-- the established project pattern (cf. price_at_booking on appointments)
-- and ensure the recipe stays consistent even if the product unit changes.
--
-- Unique scope is (treatment_id, product_id, product_section): the same
-- product could theoretically appear in both the "treatment" and "disposable"
-- sections (e.g. a gel used both as preparation and disposable pad), so a
-- stricter (treatment_id, product_id) unique would incorrectly block that.
--
-- This migration is intentionally data-only (no UI, no stock deduction,
-- no appointment_use movements). Those are separate future steps.

CREATE TABLE IF NOT EXISTS gabinet_treatment_products (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  treatment_id    TEXT NOT NULL REFERENCES gabinet_treatments(id) ON DELETE CASCADE,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- "treatment" | "disposable"  (mirrors products.product_section)
  product_section TEXT NOT NULL,
  quantity        NUMERIC NOT NULL,
  -- snapshot of products.stock_unit at link time; NULL when product has no unit
  unit            TEXT,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS gabinet_treatment_products_org_idx
  ON gabinet_treatment_products (organization_id);

CREATE INDEX IF NOT EXISTS gabinet_treatment_products_treatment_idx
  ON gabinet_treatment_products (treatment_id);

CREATE INDEX IF NOT EXISTS gabinet_treatment_products_product_idx
  ON gabinet_treatment_products (product_id);

-- Prevent the same product appearing twice in the same section for the same
-- treatment (but allow it to appear in both "treatment" and "disposable").
CREATE UNIQUE INDEX IF NOT EXISTS gabinet_treatment_products_unique_idx
  ON gabinet_treatment_products (treatment_id, product_id, product_section);

-- ---------------------------------------------------------------------------
-- RLS: org-scoped access, same pattern as all other gabinet tables.
-- ---------------------------------------------------------------------------

ALTER TABLE gabinet_treatment_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON gabinet_treatment_products
  USING (organization_id = current_org_id());
