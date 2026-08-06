-- Upgrade RLS on delivery_name_mappings to the per-command pattern established
-- in 00002_rls_policies.sql.
--
-- Migration 00061 created this table with a single ALL-operation org_isolation
-- policy (USING only, no WITH CHECK). Without WITH CHECK, INSERT and UPDATE
-- bypass the cross-org write guard, allowing a compromised service role to
-- write rows into a different org's namespace. This migration brings the table
-- in line with every other table in the project (closes #3807).

DROP POLICY IF EXISTS org_isolation ON delivery_name_mappings;

CREATE POLICY delivery_name_mappings_select ON delivery_name_mappings
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY delivery_name_mappings_insert ON delivery_name_mappings
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY delivery_name_mappings_update ON delivery_name_mappings
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY delivery_name_mappings_delete ON delivery_name_mappings
  FOR DELETE USING (current_org_id() = organization_id);
