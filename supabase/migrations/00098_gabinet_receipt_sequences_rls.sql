-- Upgrade RLS on gabinet_receipt_sequences to the per-command pattern
-- established in 00002_rls_policies.sql.
--
-- Migration 00084 created this table with a single ALL-operation org_isolation
-- policy (USING only, no WITH CHECK). Without WITH CHECK, INSERT and UPDATE
-- bypass the cross-org write guard, allowing a compromised service role to
-- write rows into a different org's namespace. This migration brings the table
-- in line with every other table in the project (closes #3809).

DROP POLICY IF EXISTS org_isolation ON gabinet_receipt_sequences;

CREATE POLICY gabinet_receipt_sequences_select ON gabinet_receipt_sequences
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_receipt_sequences_insert ON gabinet_receipt_sequences
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_receipt_sequences_update ON gabinet_receipt_sequences
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_receipt_sequences_delete ON gabinet_receipt_sequences
  FOR DELETE USING (current_org_id() = organization_id);
