-- Allow gabinet_employees to be created without a linked user account.
-- When system access is not granted the user_id stays NULL; the unique index
-- still prevents duplicate user→org links when user_id IS provided because
-- Postgres treats each NULL as distinct in a unique index.
ALTER TABLE gabinet_employees ALTER COLUMN user_id DROP NOT NULL;
