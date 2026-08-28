-- Platform Admin SP3 T2: global user suspension flag. Absent/false = active;
-- true blocks the user from minting Supabase tokens and passing auth guards.
-- Nullable + idempotent — existing rows read as active. Supabase-authoritative
-- (mirrors is_platform_admin), written only via the setUserSuspended admin action.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_suspended boolean;
