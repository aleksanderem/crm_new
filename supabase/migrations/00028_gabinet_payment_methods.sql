-- Configurable payment methods (Gabinet). Org-scoped definition table that
-- replaces the hardcoded payment_method lists across the UI and the
-- payment_method_enum constraint. System methods are seeded lazily on first
-- read (convex/gabinet/paymentMethods.list).
--
-- Mirrors the gabinet_leave_types stack (table -> RLS org_isolation -> mapper
-- -> hook -> Convex action CRUD). RLS scopes every row to current_org_id().
-- Timestamps are BIGINT ms-epoch; soft-delete via is_active is the norm but
-- custom methods may be hard-deleted (system methods are protected in the
-- application layer).

CREATE TABLE IF NOT EXISTS gabinet_payment_methods (
  id                              TEXT PRIMARY KEY,
  organization_id                 TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key                             TEXT NOT NULL,
  name                            TEXT NOT NULL,
  is_system                       BOOLEAN NOT NULL,
  is_active                       BOOLEAN NOT NULL,
  "order"                         INTEGER NOT NULL,
  available_for_settlement        BOOLEAN NOT NULL,
  available_for_sales             BOOLEAN NOT NULL,
  available_for_refund            BOOLEAN NOT NULL,
  locks_amount_to_treatment_price BOOLEAN NOT NULL,
  is_package_coverage             BOOLEAN NOT NULL,
  created_by                      TEXT NOT NULL REFERENCES users(id),
  created_at                      BIGINT NOT NULL,
  updated_at                      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS gabinet_payment_methods_org_idx
  ON gabinet_payment_methods (organization_id);
CREATE INDEX IF NOT EXISTS gabinet_payment_methods_org_active_idx
  ON gabinet_payment_methods (organization_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS gabinet_payment_methods_org_key_idx
  ON gabinet_payment_methods (organization_id, key);

ALTER TABLE gabinet_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY gabinet_payment_methods_select ON gabinet_payment_methods
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_payment_methods_insert ON gabinet_payment_methods
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_payment_methods_update ON gabinet_payment_methods
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_payment_methods_delete ON gabinet_payment_methods
  FOR DELETE USING (current_org_id() = organization_id);

-- Relax the payments.payment_method enum so custom method keys are allowed.
-- Existing values (cash/card/transfer/package/gratis/barter/other) stay valid.
-- The now-unused payment_method_enum type is intentionally left in place.
ALTER TABLE payments ALTER COLUMN payment_method TYPE TEXT;
