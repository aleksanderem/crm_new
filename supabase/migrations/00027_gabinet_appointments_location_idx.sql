-- Add composite index to support location-scoped appointment queries.
-- gabinet_appointments.location_id is nullable (no location assigned);
-- the index covers both filtered list and date-range calendar queries.
CREATE INDEX IF NOT EXISTS gabinet_appointments_org_location_idx
  ON gabinet_appointments (organization_id, location_id)
  WHERE location_id IS NOT NULL;
