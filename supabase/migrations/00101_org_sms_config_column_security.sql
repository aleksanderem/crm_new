-- ============================================================
-- Migration 00101: Column-level security for org_sms_config (closes #3908)
-- ============================================================
--
-- Context: org_sms_config stores SMS provider credentials (api_token,
-- api_secret). Row-level RLS already restricts which rows browser
-- clients see (org isolation), but there is no barrier preventing a
-- browser JWT holder from adjusting the supabase-js select expression
-- to read api_token / api_secret directly.
--
-- Fix (three-step):
--
--   1. Revoke table-level SELECT on org_sms_config from browser-facing
--      roles so raw credential columns cannot be read through the
--      PostgREST data API.
--
--   2. Re-grant SELECT at the column level for non-sensitive columns
--      only — this preserves RLS-filtered queries for safe columns
--      and leaves Convex / service-role access unaffected.
--
--   3. Create a SECURITY BARRIER view (org_sms_config_summary) that
--      exposes safe columns plus computed has_token / has_secret booleans.
--      The view owner (privileged role) can evaluate api_token / api_secret
--      inside boolean expressions; the raw values are never returned.
--      SECURITY BARRIER guarantees the org-isolation WHERE clause is
--      enforced before any caller-supplied predicates, preventing
--      filter-based side-channel leakage.
-- ============================================================

-- Step 1: Remove table-level SELECT from browser-facing roles.
-- service_role bypasses RLS / privileges and is unaffected.
REVOKE SELECT ON org_sms_config FROM authenticated, anon;

-- Step 2: Re-grant SELECT on non-sensitive columns only.
GRANT SELECT (
  id,
  organization_id,
  provider,
  sender_id,
  from_number,
  is_active,
  created_at,
  updated_at
) ON org_sms_config TO authenticated, anon;

-- Step 3: Summary view — non-credential columns + computed presence flags.
-- SECURITY BARRIER ensures the org-isolation predicate runs first, so
-- an attacker cannot craft outer conditions that probe credential values
-- via function side effects before the WHERE filter is applied.
-- current_org_id() reads the session variable set from the JWT claim;
-- it returns NULL when no JWT is present, making the WHERE false for
-- all rows (safe empty result).
CREATE OR REPLACE VIEW org_sms_config_summary
  WITH (security_barrier = true)
AS
SELECT
  id,
  organization_id,
  provider,
  sender_id,
  from_number,
  is_active,
  created_at,
  updated_at,
  (api_token  IS NOT NULL AND api_token  != '') AS has_token,
  (api_secret IS NOT NULL AND api_secret != '') AS has_secret
FROM org_sms_config
WHERE organization_id = current_org_id();

-- Grant SELECT on the summary view to browser-facing roles.
GRANT SELECT ON org_sms_config_summary TO authenticated, anon;
