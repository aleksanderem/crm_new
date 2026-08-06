-- ============================================================
-- Migration 00099: Tighten RLS for users table (closes #3822)
-- ============================================================
--
-- Context (issue #3822 — PK6 production launch checklist):
--   Migration 00002 already enables RLS on both `users` and
--   `subscriptions` and creates policies, but the `users` SELECT
--   policy used USING (true) — any authenticated browser session
--   could read personal data (email, phone, name) for any user on
--   the platform, not just members of their own org.
--
-- Fix:
--   Scope `users` SELECT to:
--     1. The caller's own record (self)
--     2. Other users who share a team_membership in the caller's
--        current org (member directory, assignee name resolution)
--     3. Service role (backend unrestricted access)
--
-- No change to subscriptions:
--   The subscriptions table has no organization_id; it links to
--   users via user_id (Stripe user-level subscription). The
--   existing policy from 00002 —
--     USING (user_id = current_user_id() OR is_service_role())
--   — already correctly scopes reads to the owner's own row.
--   No mutation is needed here.
-- ============================================================

-- Drop the overly permissive global-read policy
DROP POLICY IF EXISTS users_select ON users;

-- Org-scoped read: self + org co-members + service role
CREATE POLICY users_select ON users
  FOR SELECT
  USING (
    is_service_role()
    OR id = current_user_id()
    OR EXISTS (
      SELECT 1 FROM team_memberships
      WHERE team_memberships.user_id    = users.id
        AND team_memberships.organization_id = current_org_id()
    )
  );
