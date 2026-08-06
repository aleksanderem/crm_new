-- Upgrade RLS on warehouse_deliveries and warehouse_delivery_items to the
-- per-command pattern established in 00002_rls_policies.sql.
--
-- Migration 00051 created these tables with a single ALL-operation org_isolation
-- policy (USING only, no WITH CHECK). Without WITH CHECK, INSERT and UPDATE
-- bypass the cross-org write guard, allowing a compromised service role to
-- write rows into a different org's namespace. This migration brings both
-- tables in line with every other table in the project (closes #3805).

DROP POLICY IF EXISTS org_isolation ON warehouse_deliveries;

CREATE POLICY warehouse_deliveries_select ON warehouse_deliveries
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY warehouse_deliveries_insert ON warehouse_deliveries
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY warehouse_deliveries_update ON warehouse_deliveries
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY warehouse_deliveries_delete ON warehouse_deliveries
  FOR DELETE USING (current_org_id() = organization_id);

DROP POLICY IF EXISTS org_isolation ON warehouse_delivery_items;

CREATE POLICY warehouse_delivery_items_select ON warehouse_delivery_items
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY warehouse_delivery_items_insert ON warehouse_delivery_items
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY warehouse_delivery_items_update ON warehouse_delivery_items
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY warehouse_delivery_items_delete ON warehouse_delivery_items
  FOR DELETE USING (current_org_id() = organization_id);
