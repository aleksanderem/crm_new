-- Link stock movements to a gabinet employee (#5598).
--
-- `performed_by` captures the authenticated user but cannot distinguish which
-- gabinet employee performed the sale when a single user account is shared or
-- when a manager records a sale on behalf of a therapist. `employee_id` fills
-- that gap and enables per-employee sales reporting without schema-level joins
-- through the users table.
--
-- Nullable so that:
--   • existing movements without an employee context are unaffected,
--   • non-gabinet sales (CRM deal close, warehouse adjustments, etc.) remain
--     valid without ever setting this field.

ALTER TABLE product_stock_movements
  ADD COLUMN IF NOT EXISTS employee_id TEXT REFERENCES gabinet_employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS product_stock_movements_employee_idx
  ON product_stock_movements (employee_id)
  WHERE employee_id IS NOT NULL;
