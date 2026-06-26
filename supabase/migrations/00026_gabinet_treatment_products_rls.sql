-- Upgrade RLS on gabinet_treatment_products to the per-command pattern
-- established in 00002_rls_policies.sql.
--
-- Migration 00025 created this table with a single ALL-operation org_isolation
-- policy (USING only, no WITH CHECK). That broad pattern was replaced project-
-- wide by 00002, but gabinet_treatment_products was introduced afterwards and
-- inherited the old shape. This migration brings it in line with every other
-- table in the project (#2332).

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
