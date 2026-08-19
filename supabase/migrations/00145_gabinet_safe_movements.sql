-- Sejf (cash safe) movement log — R2A (issue #5573).
-- The safe balance is always derived from history:
--   SUM(amount) WHERE type = 'transfer_in'  MINUS
--   SUM(amount) WHERE type = 'withdrawal'
-- There is no separate "current balance" column — that would duplicate data and
-- allow the balance to drift out of sync with the movement history.
--
-- Each movement is immutable once recorded. Corrections are made by creating a
-- new compensating movement, not by editing existing rows.
--
-- location_id is NOT NULL because the safe is per-location by design (the
-- caller must always specify which location's safe is being operated on).

CREATE TABLE IF NOT EXISTS gabinet_safe_movements (
  id                      TEXT PRIMARY KEY,
  organization_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id             TEXT NOT NULL REFERENCES gabinet_locations(id) ON DELETE RESTRICT,
  type                    TEXT NOT NULL CHECK (type IN ('transfer_in', 'withdrawal')),
  amount                  NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description             TEXT,
  reference_day_close_id  TEXT REFERENCES gabinet_day_closes(id) ON DELETE SET NULL,
  created_by              TEXT NOT NULL REFERENCES users(id),
  created_at              BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS gabinet_safe_movements_org_idx
  ON gabinet_safe_movements (organization_id);

CREATE INDEX IF NOT EXISTS gabinet_safe_movements_org_location_idx
  ON gabinet_safe_movements (organization_id, location_id);

CREATE INDEX IF NOT EXISTS gabinet_safe_movements_org_location_created_idx
  ON gabinet_safe_movements (organization_id, location_id, created_at DESC);

ALTER TABLE gabinet_safe_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY gabinet_safe_movements_select ON gabinet_safe_movements
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_safe_movements_insert ON gabinet_safe_movements
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
-- No UPDATE/DELETE policies: movements are immutable once written.
