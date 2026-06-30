-- gabinet_employee_locations join table (#2454).
--
-- Records which locations each gabinet employee is authorized to work at.
-- An employee can be assigned to multiple locations (multi-location clinics /
-- salon chains). The `is_primary` flag marks the employee's default location —
-- used for scheduling defaults and calendar filtering.
--
-- Relationship to gabinet_employees.location_id (added in migration 00029):
-- That column is a convenience denormalization for "primary location" and
-- remains valid for simple single-location use cases. This table is the
-- authoritative source for multi-location access grants and is what future RLS
-- policies that scope appointment access by location should read from.
--
-- Backfill: existing employees that already have a location_id are granted
-- membership to that location with is_primary = TRUE so they do not lose
-- appointment access when location-scoped RLS is enabled. Employees without
-- a location_id are not backfilled; they will gain access once assigned via
-- the UI or a subsequent migration.

CREATE TABLE IF NOT EXISTS gabinet_employee_locations (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id     TEXT NOT NULL REFERENCES gabinet_employees(id) ON DELETE CASCADE,
  location_id     TEXT NOT NULL REFERENCES gabinet_locations(id) ON DELETE CASCADE,
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS gabinet_employee_locations_org_idx
  ON gabinet_employee_locations (organization_id);

CREATE INDEX IF NOT EXISTS gabinet_employee_locations_employee_idx
  ON gabinet_employee_locations (employee_id);

CREATE INDEX IF NOT EXISTS gabinet_employee_locations_location_idx
  ON gabinet_employee_locations (location_id);

-- Prevents the same (employee, location) pair from appearing more than once.
CREATE UNIQUE INDEX IF NOT EXISTS gabinet_employee_locations_unique_idx
  ON gabinet_employee_locations (employee_id, location_id);

-- ---------------------------------------------------------------------------
-- RLS: per-command org-scoped policies (pattern established in
-- 00002_rls_policies.sql, per-command split per 00026).
-- ---------------------------------------------------------------------------

ALTER TABLE gabinet_employee_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY gabinet_employee_locations_select ON gabinet_employee_locations
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_employee_locations_insert ON gabinet_employee_locations
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_employee_locations_update ON gabinet_employee_locations
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_employee_locations_delete ON gabinet_employee_locations
  FOR DELETE USING (current_org_id() = organization_id);

-- ---------------------------------------------------------------------------
-- Backfill: seed from existing gabinet_employees.location_id.
--
-- Backfill IDs are UUID-style strings (not Convex IDs) because these rows are
-- created outside the Convex mutation path. Future inserts via Convex mutations
-- will use proper Convex-generated IDs. The UUID backfill rows are treated as
-- opaque TEXT PKs — Supabase and RLS policies only care that they are unique.
-- ---------------------------------------------------------------------------

INSERT INTO gabinet_employee_locations
  (id, organization_id, employee_id, location_id, is_primary, created_at)
SELECT
  gen_random_uuid()::text,
  e.organization_id,
  e.id,
  e.location_id,
  TRUE,
  (extract(epoch from now()) * 1000)::bigint
FROM gabinet_employees e
WHERE e.location_id IS NOT NULL
ON CONFLICT (employee_id, location_id) DO NOTHING;
