-- Upgrade RLS on gabinet_treatment_products to the per-command pattern
-- established in 00002_rls_policies.sql.
--
-- Migration 00025 created this table with a single ALL-operation org_isolation
-- policy (USING only, no WITH CHECK). Without WITH CHECK, INSERT and UPDATE
-- bypass the cross-org write guard, allowing a compromised service role to
-- write rows into a different org's namespace. This migration brings the table
-- in line with every other table in the project (closes #3801).

DROP POLICY IF EXISTS org_isolation ON gabinet_treatment_products;

CREATE POLICY gabinet_treatment_products_select ON gabinet_treatment_products
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_treatment_products_insert ON gabinet_treatment_products
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_treatment_products_update ON gabinet_treatment_products
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_treatment_products_delete ON gabinet_treatment_products
  FOR DELETE USING (current_org_id() = organization_id);
