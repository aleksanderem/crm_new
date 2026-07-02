-- Add 'cosmetologist' and 'manager' values to gabinet_employee_role_enum.
-- The UI (employee form and employee detail page) was updated in issues #2579 and #2581
-- to use these roles, but the Postgres enum was never extended.
-- ALTER TYPE … ADD VALUE is non-transactional in Postgres and cannot be rolled back,
-- but is safe to run on an existing type — duplicate values are rejected at DDL time,
-- not at runtime, so this migration is idempotent if applied twice on different envs.

ALTER TYPE gabinet_employee_role_enum ADD VALUE IF NOT EXISTS 'cosmetologist';
ALTER TYPE gabinet_employee_role_enum ADD VALUE IF NOT EXISTS 'manager';
