-- Add optional primary/default location to gabinet_employees.
-- Nullable: employees without a fixed location remain unaffected.
ALTER TABLE gabinet_employees
  ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES gabinet_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gabinet_employees_org_location_idx
  ON gabinet_employees (organization_id, location_id)
  WHERE location_id IS NOT NULL;
