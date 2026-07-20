-- Add package_deducted flag to gabinet_appointments (mirrors stock_deducted,
-- added in 00048). Used to prevent double-deduction of package entries when
-- the same appointment is completed twice (e.g. completed → rescheduled →
-- completed). The flag is flipped atomically via a conditional UPDATE (CAS)
-- so only one concurrent caller can win the race. Closes #3206.
ALTER TABLE gabinet_appointments
  ADD COLUMN package_deducted BOOLEAN NOT NULL DEFAULT false;
