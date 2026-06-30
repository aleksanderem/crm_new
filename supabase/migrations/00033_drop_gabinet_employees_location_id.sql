-- Drop gabinet_employees.location_id after join table adoption (#2460).
--
-- migration 00029 added a single location_id FK on gabinet_employees as a
-- convenience denormalization. Migration 00030 introduced the
-- gabinet_employee_locations join table as the authoritative many-to-many
-- source, and backfilled all existing location_id values into that table.
--
-- All read paths now go through gabinet_employee_locations; the column on
-- gabinet_employees is unused stale state.

DROP INDEX IF EXISTS gabinet_employees_org_location_idx;

ALTER TABLE gabinet_employees
  DROP COLUMN IF EXISTS location_id;
