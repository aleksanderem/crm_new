-- gabinet_receipt_sequences: atomic per-location-per-year counter for
-- generating legally-compliant receipt numbers (issue #3736).
--
-- Receipt numbers follow the format YYYY/NNN/LOC where:
--   YYYY  — calendar year (e.g. 2026)
--   NNN   — zero-padded sequential number within the year and location
--   LOC   — location code (derived from gabinetLocations at call time)
--
-- The lastNumber column is incremented atomically via
--   UPDATE gabinet_receipt_sequences SET last_number = last_number + 1 ...
--   RETURNING last_number
-- which avoids any race condition under concurrent writes. The Convex
-- mutation layer also benefits from OCC, but the Postgres UPDATE+RETURNING
-- approach is the canonical guarantee.
--
-- location_id is nullable so orgs without multi-location setup can have a
-- single sequence (location_id IS NULL) per year.

CREATE TABLE gabinet_receipt_sequences (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id     TEXT REFERENCES gabinet_locations(id) ON DELETE SET NULL,
  year            INTEGER NOT NULL,
  last_number     INTEGER NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL,
  UNIQUE (organization_id, location_id, year)
);

CREATE INDEX gabinet_receipt_sequences_org_idx
  ON gabinet_receipt_sequences (organization_id);

ALTER TABLE gabinet_receipt_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_receipt_sequences
  USING (organization_id = current_setting('app.current_org_id', true));

-- Add locationId and status columns to gabinet_receipts (issue #3736).
--
-- location_id: links the receipt to the gabinet location where the service
--   was rendered. Optional so existing rows (created before this migration)
--   remain valid.
--
-- status: lifecycle of the receipt document.
--   issued — default state for newly created receipts.
--   void   — receipt has been voided (edge case; Polish fiscal law limits this).

ALTER TABLE gabinet_receipts
  ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES gabinet_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'issued';

ALTER TABLE gabinet_receipts
  DROP CONSTRAINT IF EXISTS gabinet_receipts_status_check;
ALTER TABLE gabinet_receipts
  ADD CONSTRAINT gabinet_receipts_status_check
  CHECK (status IN ('issued', 'void'));

CREATE INDEX IF NOT EXISTS gabinet_receipts_location_idx
  ON gabinet_receipts (organization_id, location_id);
