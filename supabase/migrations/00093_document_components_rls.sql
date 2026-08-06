-- document_components RLS — add JWT-authenticated read/write path.
-- Migration 00004 created the table with RLS enabled but only registered a
-- service-role ALL policy, so any JWT query silently returned 0 rows.
--
-- Read path
--   system-scoped rows (organization_id IS NULL): any authenticated user
--   org/user-scoped rows: members of the owning org
--
-- Write path
--   org/user-scoped rows: members of the owning org
--   system-scoped rows: service-role only (covered by the existing ALL policy)

CREATE POLICY document_components_select ON document_components
  FOR SELECT
  USING (
    (scope = 'system' AND organization_id IS NULL)
    OR current_org_id() = organization_id
  );

CREATE POLICY document_components_insert ON document_components
  FOR INSERT
  WITH CHECK (current_org_id() = organization_id);

CREATE POLICY document_components_update ON document_components
  FOR UPDATE
  USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);

CREATE POLICY document_components_delete ON document_components
  FOR DELETE
  USING (current_org_id() = organization_id);

NOTIFY pgrst, 'reload schema';
