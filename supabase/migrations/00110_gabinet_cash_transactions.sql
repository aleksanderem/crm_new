-- Cash register transactions: manual deposits and withdrawals from the cash
-- drawer during a working day (not tied to patient payments). Used by the
-- end-of-day report to track non-payment cash movements so the expected cash
-- balance can be reconciled against the physically counted amount.

CREATE TABLE IF NOT EXISTS gabinet_cash_transactions (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id      TEXT REFERENCES gabinet_locations(id) ON DELETE SET NULL,
  date             TEXT NOT NULL, -- YYYY-MM-DD (local date of the transaction)
  type             TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal')),
  amount           NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  reason           TEXT,
  created_by       TEXT NOT NULL REFERENCES users(id),
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS gabinet_cash_transactions_org_idx
  ON gabinet_cash_transactions (organization_id);
CREATE INDEX IF NOT EXISTS gabinet_cash_transactions_org_date_idx
  ON gabinet_cash_transactions (organization_id, date);

ALTER TABLE gabinet_cash_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY gabinet_cash_transactions_select ON gabinet_cash_transactions
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_cash_transactions_insert ON gabinet_cash_transactions
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_cash_transactions_update ON gabinet_cash_transactions
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_cash_transactions_delete ON gabinet_cash_transactions
  FOR DELETE USING (current_org_id() = organization_id);
