-- Add stock_deducted flag to gabinet_appointments so the warehouse
-- auto-deduction guard is airtight across all rollback paths.
-- The previous guard checked `status != 'completed'` which fails for
-- completed→in_progress→completed because on the second completion the
-- status is 'in_progress', not 'completed'. A dedicated boolean persists
-- across status changes and makes the check unambiguous. Closes #2916.

ALTER TABLE gabinet_appointments
  ADD COLUMN stock_deducted BOOLEAN NOT NULL DEFAULT false;
