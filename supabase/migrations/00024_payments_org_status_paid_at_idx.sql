-- Add composite index on (organization_id, status, paid_at) for the reports
-- revenue query, which filters by all three columns. The existing
-- payments_org_status_idx only covers (organization_id, status), leaving
-- a sequential scan over the date range for the matching rows.
CREATE INDEX IF NOT EXISTS payments_org_status_paid_at_idx
  ON payments (organization_id, status, paid_at);
