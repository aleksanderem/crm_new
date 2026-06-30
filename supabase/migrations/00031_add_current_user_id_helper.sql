-- Migration 00031: Add current_user_id() SQL helper function
--
-- Adds the missing JWT helper that extracts the `sub` claim (Convex user ID)
-- from the request JWT. Mirrors current_org_id() from 00002_rls_policies.sql.
--
-- Needed to resolve the JWT sub claim to users.id in RLS policies that scope
-- access by user identity (e.g. location-join lookups, employee self-access
-- policies). Previously these policies inlined the extraction expression;
-- the helper centralises it and makes future policies easier to write.
--
-- Uses CREATE OR REPLACE so this migration is safe to apply to databases
-- that already have the function from a re-run of 00002_rls_policies.sql.

CREATE OR REPLACE FUNCTION current_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(
    current_setting('request.jwt.claims', true)::json->>'sub',
    ''
  )
$$;
