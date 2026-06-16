-- Issue #1876: per-employee assigned items (keys, uniform, access card, etc.)
--
-- Stores a list of equipment / materials issued to an employee. Each entry
-- captures the item name, optional quantity, issue/return dates, and free-form
-- notes (e.g. serial number, locker number). Returned items are kept in the
-- list with a returnedDate set so the history is preserved.

ALTER TABLE gabinet_employees
  ADD COLUMN IF NOT EXISTS assigned_items JSONB;
