-- ============================================================
-- Migration 00102: User-own SELECT policies for org bootstrap
-- ============================================================
--
-- The "my organizations" bootstrap query in DashboardLayout runs before
-- OrgProvider is mounted, so the Supabase JWT has no org_id claim. The
-- existing org_isolation policies on team_memberships and organizations
-- both gate on current_org_id(), which is null at that point.
--
-- This migration adds supplementary SELECT-only policies keyed on the JWT
-- `sub` (current_user_id()) so a user can enumerate their own memberships
-- and the organizations those memberships belong to — even without an
-- org context in the token.
--
-- All INSERT / UPDATE / DELETE paths still require a valid org context.

-- Allow a user to SELECT their own team_memberships across all orgs.
CREATE POLICY team_memberships_own_user_select ON team_memberships
  FOR SELECT
  USING (user_id = current_user_id());

-- Allow a user to SELECT any organization they are a member of.
CREATE POLICY organizations_member_user_select ON organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_memberships tm
      WHERE tm.organization_id = organizations.id
        AND tm.user_id = current_user_id()
    )
  );
