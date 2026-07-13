-- Warehouse deliveries (#2961).
--
-- Adds two tables that represent a goods-receipt document:
--
--   • warehouse_deliveries — header with supplier, invoice number, VAT, date,
--     and a status flag that distinguishes a draft being edited from a posted
--     delivery whose stock movements have already been created.
--
--   • warehouse_delivery_items — line items, one row per (delivery, product),
--     with quantity, unit purchase price, and VAT rate.  When a delivery is
--     posted the backend writes one product_stock_movements row per item and
--     stores the resulting movement_id here so the receipt can be cross-linked
--     back to the audit trail.
--
-- The single-movement model (product_stock_movements reason='warehouse_receive')
-- remains in place for quick ad-hoc receipts; the new tables are the document
-- layer on top of it for multi-product receipts with supplier tracking.

-- ---------------------------------------------------------------------------
-- warehouse_deliveries
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS warehouse_deliveries (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_name   TEXT,
  invoice_number  TEXT,
  delivery_date   TEXT,                              -- ISO date YYYY-MM-DD
  location_id     TEXT REFERENCES gabinet_locations(id) ON DELETE SET NULL,
  notes           TEXT,
  -- 'draft'  = items can still be edited, no stock movements yet
  -- 'posted' = stock movements written, record is read-only
  status          TEXT NOT NULL DEFAULT 'draft',
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL,

  CONSTRAINT warehouse_deliveries_status_check
    CHECK (status IN ('draft', 'posted'))
);

CREATE INDEX IF NOT EXISTS warehouse_deliveries_org_created_idx
  ON warehouse_deliveries (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS warehouse_deliveries_org_status_idx
  ON warehouse_deliveries (organization_id, status);

-- ---------------------------------------------------------------------------
-- warehouse_delivery_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS warehouse_delivery_items (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  delivery_id     TEXT NOT NULL REFERENCES warehouse_deliveries(id) ON DELETE CASCADE,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity        NUMERIC NOT NULL,
  unit_price      NUMERIC,                           -- purchase price excl. VAT
  vat_rate        NUMERIC,                           -- percentage, e.g. 23.0
  -- Filled in when the parent delivery is posted; links to the audit trail.
  movement_id     TEXT REFERENCES product_stock_movements(id) ON DELETE SET NULL,
  created_at      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS warehouse_delivery_items_delivery_idx
  ON warehouse_delivery_items (delivery_id);

CREATE INDEX IF NOT EXISTS warehouse_delivery_items_org_idx
  ON warehouse_delivery_items (organization_id);

CREATE INDEX IF NOT EXISTS warehouse_delivery_items_product_idx
  ON warehouse_delivery_items (product_id);

-- ---------------------------------------------------------------------------
-- RLS: org-scoped access, same pattern as existing inventory tables.
-- ---------------------------------------------------------------------------

ALTER TABLE warehouse_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON warehouse_deliveries
  USING (organization_id = current_org_id());

ALTER TABLE warehouse_delivery_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON warehouse_delivery_items
  USING (organization_id = current_org_id());
