-- Upgrade RLS on gabinet_appointment_treatments to the per-command pattern
-- established in 00002_rls_policies.sql.
--
-- Migration 00069 created this table with a single ALL-operation org_isolation
-- policy (USING only, no WITH CHECK). Without WITH CHECK, INSERT and UPDATE
-- bypass the cross-org write guard, allowing a compromised service role to
-- write rows into a different org's namespace. This migration brings the table
-- in line with every other table in the project (closes #3806).

DROP POLICY IF EXISTS org_isolation ON gabinet_appointment_treatments;

CREATE POLICY gabinet_appointment_treatments_select ON gabinet_appointment_treatments
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_appointment_treatments_insert ON gabinet_appointment_treatments
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_appointment_treatments_update ON gabinet_appointment_treatments
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_appointment_treatments_delete ON gabinet_appointment_treatments
  FOR DELETE USING (current_org_id() = organization_id);
