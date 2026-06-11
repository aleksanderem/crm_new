-- Expose the latest applied migration version to the browser (issue #1576).
--
-- The frontend boots a single health check that calls this RPC and compares
-- the returned version with the build-time expected version. If the schema
-- is behind, the app shows one warning banner instead of letting every
-- feature fail individually with PGRST204 toasts.
--
-- `supabase_migrations.schema_migrations` is the same tracking table our
-- `scripts/supabase-migrations.mjs` writes to and the Supabase CLI uses.
-- It lives outside the `public` schema, so PostgREST cannot read it
-- directly; this SECURITY DEFINER function bridges that gap with a
-- minimal, read-only surface.

CREATE OR REPLACE FUNCTION public.app_schema_version()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = supabase_migrations, pg_temp
AS $$
  SELECT version
  FROM supabase_migrations.schema_migrations
  ORDER BY version DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.app_schema_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_schema_version() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.app_schema_version() IS
  'Returns the version prefix (e.g. ''00012'') of the latest applied migration ' ||
  'tracked in supabase_migrations.schema_migrations. Used by the frontend boot ' ||
  'health check (issue #1576) to detect a stale schema.';
