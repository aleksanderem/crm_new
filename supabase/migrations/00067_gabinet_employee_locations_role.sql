-- Add `role` column to gabinet_employee_locations (#3311).
--
-- Enables role-per-location: an employee can act as "doctor" at one branch and
-- "therapist" at another. NULL means the employee's default role from
-- gabinet_employees.role applies at that location.

ALTER TABLE gabinet_employee_locations
  ADD COLUMN IF NOT EXISTS role gabinet_employee_role_enum NULL;
