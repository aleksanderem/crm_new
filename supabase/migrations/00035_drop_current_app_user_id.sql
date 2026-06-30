-- Migration 00035: Drop unused current_app_user_id() helper (closes #2464)
--
-- current_app_user_id() was introduced in 00001_initial_schema.sql as an early
-- helper that extracted the caller's user ID via:
--
--   COALESCE(app.current_user_id GUC, jwt.claims->>'sub')
--
-- 00002_rls_policies.sql introduced current_user_id() with a simpler, JWT-only
-- implementation (nullif(jwt.claims->>'sub', '')) and wired all RLS policies to
-- use that function. current_app_user_id() was never referenced in any policy
-- and became dead code.
--
-- Dropping it removes the ambiguity so future contributors have a single,
-- clearly-named function to call: current_user_id().

DROP FUNCTION IF EXISTS current_app_user_id();
