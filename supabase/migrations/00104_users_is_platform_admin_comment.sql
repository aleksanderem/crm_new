-- Document that users.is_platform_admin is Supabase-only (closes #3880).
-- The Convex schema (convex/schema.ts) does not carry this field.
-- All reads and writes go through createSupabaseDb() in:
--   convex/platformAdmins.ts  — list / setRole actions
--   convex/_helpers/authAction.ts  — verifyPlatformAdmin guard
--   convex/platformSettings.ts  — _grantPlatformAdmin bootstrap helper
--   convex/app.ts  — getIsPlatformAdmin action
COMMENT ON COLUMN users.is_platform_admin IS
  'Platform-admin flag (Supabase-only). '
  'convex/schema.ts does not carry this field; '
  'reads and writes go through createSupabaseDb() in '
  'platformAdmins.ts, authAction.ts, platformSettings.ts, and app.ts.';
