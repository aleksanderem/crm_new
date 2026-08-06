-- Upgrade RLS on gabinet_receipts to the per-command pattern established
-- in 00002_rls_policies.sql.
--
-- Migration 00083 created this table with a single ALL-operation org_isolation
-- policy (USING only, no WITH CHECK). Without WITH CHECK, INSERT and UPDATE
-- bypass the cross-org write guard, allowing a compromised service role to
-- write rows into a different org's namespace. This migration brings the table
-- in line with every other table in the project (closes #3808).

DROP POLICY IF EXISTS org_isolation ON gabinet_receipts;

CREATE POLICY gabinet_receipts_select ON gabinet_receipts
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_receipts_insert ON gabinet_receipts
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_receipts_update ON gabinet_receipts
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_receipts_delete ON gabinet_receipts
  FOR DELETE USING (current_org_id() = organization_id);
