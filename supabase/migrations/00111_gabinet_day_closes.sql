-- End-of-day cash register closure records (raport dobowy / zamknięcie kasy).
-- Each row is an immutable snapshot created when the receptionist formally
-- closes the register for a given date. It captures:
--   - payment_summary: JSONB breakdown { method: totalAmount } from payments
--   - total_collected: sum of all non-gratis/barter payments
--   - cash_from_payments: cash payments collected from patients
--   - cash_opening_balance: manually entered starting balance
--   - cash_deposits / cash_withdrawals: from gabinet_cash_transactions
--   - cash_expected: opening + cash_payments + deposits - withdrawals
--   - cash_counted: physically counted by receptionist
--   - cash_discrepancy: counted - expected (positive = surplus, negative = shortfall)
--
-- Unique index allows at most one close per (org, optional-location, date).

CREATE TABLE IF NOT EXISTS gabinet_day_closes (
  id                    TEXT PRIMARY KEY,
  organization_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id           TEXT REFERENCES gabinet_locations(id) ON DELETE SET NULL,
  date                  TEXT NOT NULL, -- YYYY-MM-DD
  payment_summary       JSONB NOT NULL DEFAULT '{}',
  total_collected       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cash_from_payments    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cash_opening_balance  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cash_deposits         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cash_withdrawals      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cash_expected         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cash_counted          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cash_discrepancy      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes                 TEXT,
  closed_by             TEXT NOT NULL REFERENCES users(id),
  closed_at             BIGINT NOT NULL,
  created_at            BIGINT NOT NULL,
  updated_at            BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS gabinet_day_closes_org_idx
  ON gabinet_day_closes (organization_id);
CREATE INDEX IF NOT EXISTS gabinet_day_closes_org_date_idx
  ON gabinet_day_closes (organization_id, date DESC);

-- One close per org per date. COALESCE handles NULL location_id because
-- standard UNIQUE treats two NULLs as distinct (would allow duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS gabinet_day_closes_org_location_date_idx
  ON gabinet_day_closes (organization_id, COALESCE(location_id, ''), date);

ALTER TABLE gabinet_day_closes ENABLE ROW LEVEL SECURITY;

CREATE POLICY gabinet_day_closes_select ON gabinet_day_closes
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_day_closes_insert ON gabinet_day_closes
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_day_closes_update ON gabinet_day_closes
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_day_closes_delete ON gabinet_day_closes
  FOR DELETE USING (current_org_id() = organization_id);
