-- Add is_platform_admin to users table.
-- Previously this flag lived only in the Convex document store; now it is
-- synced to Supabase so platformAdmins.list (an action) can read it via the
-- Supabase service client. Writes dual-write to both stores so
-- requirePlatformAdmin (ctx.db.get path) stays in sync.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN DEFAULT FALSE;
