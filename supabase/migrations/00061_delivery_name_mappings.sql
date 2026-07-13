-- Saved invoice-name → product mappings for delivery item matching (#3053).
--
-- Persists confirmed invoice item name → product ID mappings per organisation.
-- matchDeliveryItems reads these as matching priority #1 (ahead of exact-name
-- and fuzzy-name matching) and writes back auto-confirmed exact-name matches so
-- future deliveries benefit from the mapping even if the product catalog changes.
--
-- invoice_name stores the raw name as it appeared on the invoice; normalisation
-- happens at query time in the matching engine (see invoiceMatching.ts).
--
-- The unique constraint on (organization_id, invoice_name) enforces at most one
-- product mapping per invoice name per organisation.

CREATE TABLE IF NOT EXISTS delivery_name_mappings (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_name    TEXT NOT NULL,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at      BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_name_mappings_org_name_uidx
  ON delivery_name_mappings (organization_id, invoice_name);

CREATE INDEX IF NOT EXISTS delivery_name_mappings_org_idx
  ON delivery_name_mappings (organization_id);

ALTER TABLE delivery_name_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON delivery_name_mappings
  USING (organization_id = current_org_id());
