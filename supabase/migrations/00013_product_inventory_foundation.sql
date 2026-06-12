-- Product inventory foundation (#1700 PR-A).
--
-- Extends the CRM products table with optional stock-tracking flags and
-- adds two new tables that form the inventory audit trail:
--
--   • product_stock_levels — current quantity-on-hand per (product, location).
--     location_id is nullable so CRM-only organizations (without any
--     gabinet_locations rows) keep one row per product with location_id = NULL.
--     Gabinet organizations may keep multiple rows per product, one per
--     gabinet_location they actually stock the product in.
--
--   • product_stock_movements — append-only history. Every stock change writes
--     one row with `delta` (positive for receipts, negative for issues) and a
--     snapshot of the per-(product, location) running balance after the change
--     in `balance_after`. `reason` is a small enum-shaped string; `source_type`
--     / `source_id` link the movement back to the originating record (e.g. a
--     gabinet appointment or CRM deal) once later phases wire them up.
--
-- This migration is intentionally additive: existing products keep working
-- with track_stock = NULL/FALSE and no stock_levels rows. The follow-up
-- module-feature-flag PR (PR-B) will let an organization explicitly opt in
-- to inventory.

-- ---------------------------------------------------------------------------
-- products: stock-tracking columns
-- ---------------------------------------------------------------------------

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS track_stock BOOLEAN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_unit TEXT;

-- ---------------------------------------------------------------------------
-- product_stock_levels: current per-(product, location) quantity-on-hand
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_stock_levels (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id     TEXT REFERENCES gabinet_locations(id) ON DELETE CASCADE,
  quantity        NUMERIC NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS product_stock_levels_org_idx
  ON product_stock_levels (organization_id);

CREATE INDEX IF NOT EXISTS product_stock_levels_product_idx
  ON product_stock_levels (product_id);

-- One row per (product, location). Partial unique indexes are required
-- because PostgreSQL treats NULLs as distinct in regular UNIQUE indexes.
CREATE UNIQUE INDEX IF NOT EXISTS product_stock_levels_product_location_idx
  ON product_stock_levels (product_id, location_id)
  WHERE location_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_stock_levels_product_no_location_idx
  ON product_stock_levels (product_id)
  WHERE location_id IS NULL;

-- ---------------------------------------------------------------------------
-- product_stock_movements: append-only audit trail
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_stock_movements (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id     TEXT REFERENCES gabinet_locations(id) ON DELETE SET NULL,
  delta           NUMERIC NOT NULL,
  balance_after   NUMERIC,
  reason          TEXT NOT NULL,
  source_type     TEXT,
  source_id       TEXT,
  note            TEXT,
  performed_by    TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS product_stock_movements_org_created_idx
  ON product_stock_movements (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS product_stock_movements_product_created_idx
  ON product_stock_movements (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS product_stock_movements_source_idx
  ON product_stock_movements (source_type, source_id);

-- ---------------------------------------------------------------------------
-- RLS: org-scoped access, same pattern as existing CRM tables.
-- ---------------------------------------------------------------------------

ALTER TABLE product_stock_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON product_stock_levels
  USING (organization_id = current_org_id());

ALTER TABLE product_stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON product_stock_movements
  USING (organization_id = current_org_id());
