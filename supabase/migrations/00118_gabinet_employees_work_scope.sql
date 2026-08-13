-- Issue #4620: add work_scope column to describe the employee's work area.
-- Three valid values: 'clinic' (Obsługa gabinetu), 'office' (Praca biurowa i CRM),
-- 'both' (Obsługa gabinetu i praca biurowa). NULL means not yet set.

ALTER TABLE gabinet_employees
  ADD COLUMN IF NOT EXISTS work_scope TEXT
    CHECK (work_scope IN ('clinic', 'office', 'both'));
