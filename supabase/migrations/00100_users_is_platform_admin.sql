-- Add is_platform_admin to users table.
-- Supabase is the authoritative store for this flag. The Convex schema
-- (convex/schema.ts) does not carry isPlatformAdmin; all reads and writes
-- go through createSupabaseDb() in platformAdmins.ts, authAction.ts,
-- platformSettings.ts, and app.ts.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN DEFAULT FALSE;
