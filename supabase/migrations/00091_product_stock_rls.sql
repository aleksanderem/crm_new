-- Upgrade RLS on product_stock_levels and product_stock_movements to the
-- per-command pattern established in 00002_rls_policies.sql.
--
-- Migration 00013 created these tables with a single ALL-operation org_isolation
-- policy (USING only, no WITH CHECK). That broad pattern was replaced project-
-- wide by 00002, but the stock tables were introduced afterwards and inherited
-- the old shape. Without WITH CHECK, INSERT and UPDATE bypass the cross-org
-- write guard, allowing a compromised service role to write rows into a
-- different org's namespace. This migration brings both tables in line with
-- every other table in the project (closes #3800).

DROP POLICY IF EXISTS org_isolation ON product_stock_levels;

CREATE POLICY product_stock_levels_select ON product_stock_levels
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY product_stock_levels_insert ON product_stock_levels
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY product_stock_levels_update ON product_stock_levels
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY product_stock_levels_delete ON product_stock_levels
  FOR DELETE USING (current_org_id() = organization_id);

DROP POLICY IF EXISTS org_isolation ON product_stock_movements;

CREATE POLICY product_stock_movements_select ON product_stock_movements
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY product_stock_movements_insert ON product_stock_movements
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY product_stock_movements_update ON product_stock_movements
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY product_stock_movements_delete ON product_stock_movements
  FOR DELETE USING (current_org_id() = organization_id);
