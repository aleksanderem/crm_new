-- Migration 00037: Partial index on team_memberships for RLS admin-role subquery (#2470)
--
-- Migrations 00034 and 00036 introduced location-scoped RLS policies on
-- gabinet_appointments that include a team_memberships subquery on every row
-- evaluation to check whether the current user is an org owner or admin:
--
--   EXISTS (
--     SELECT 1 FROM team_memberships tm
--     WHERE tm.user_id        = current_user_id()
--       AND tm.organization_id = current_org_id()
--       AND tm.role IN ('owner', 'admin')
--   )
--
-- The existing unique index team_memberships_org_user_idx(organization_id, user_id)
-- limits this to at most one row lookup before the role check, but a dedicated
-- partial index covering only owner/admin rows is smaller (regular members are
-- excluded) and lets Postgres resolve a negative result (user is not an admin)
-- without touching any data pages.

CREATE INDEX team_memberships_admin_role_idx
  ON team_memberships (user_id, organization_id)
  WHERE role IN ('owner', 'admin');
