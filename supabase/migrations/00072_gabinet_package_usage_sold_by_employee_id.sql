-- Add sold_by_employee_id to gabinet_package_usage for accurate per-salesperson metrics.
-- The existing created_by field tracks who created the record (may be a receptionist/admin);
-- this column explicitly records the employee who made the sale.
ALTER TABLE gabinet_package_usage
  ADD COLUMN sold_by_employee_id TEXT REFERENCES gabinet_employees(id) ON DELETE SET NULL;

CREATE INDEX gabinet_package_usage_sold_by_employee_idx
  ON gabinet_package_usage (organization_id, sold_by_employee_id);
