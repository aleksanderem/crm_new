-- Expose invitation details by token to unauthenticated callers (issue #3977).
--
-- The login-page invite banner renders outside SupabaseProvider (no Convex JWT
-- is available yet), so it cannot use the normal authenticated Supabase client.
-- This SECURITY DEFINER function bypasses RLS in a controlled way: it only ever
-- returns the single row matching the exact token supplied, which is already a
-- secret random value known only to the invitee.

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token text)
RETURNS TABLE(
  id          text,
  email       text,
  role        text,
  status      text,
  expires_at  bigint,
  created_at  bigint,
  module      text,
  org_name    text,
  inviter_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    i.id,
    i.email,
    i.role::text,
    i.status::text,
    i.expires_at,
    i.created_at,
    i.module,
    o.name  AS org_name,
    u.name  AS inviter_name
  FROM  invitations  i
  LEFT JOIN organizations o ON o.id = i.organization_id
  LEFT JOIN users         u ON u.id = i.invited_by
  WHERE i.token = p_token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_invitation_by_token(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_invitation_by_token(text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_invitation_by_token(text) IS
  'Returns invitation details (including org name and inviter name) for the '
  'given token without requiring an authenticated JWT. Callable by the anon '
  'role so the login-page invite banner can show context before the user logs '
  'in. The token acts as the credential — only the exact matching row is '
  'returned, and no other invitation data is exposed.';
