-- Issue #4735: add is_blocked to distinguish a blocked account from a merely
-- inactive one. Previously both states shared is_active=false so the system
-- could not tell them apart.
--
-- DEFAULT false ensures old rows with is_active=false remain "inactive" (not
-- "blocked") unless an explicit block action is taken.

ALTER TABLE gabinet_employees
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;
