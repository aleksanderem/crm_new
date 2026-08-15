-- ============================================================
-- Migration 00126: Add source and granted_by_user_id to
--   product_subscriptions (closes #4963)
-- ============================================================
--
-- Context:
--   admin/entitlements.ts _upsertEntitlement writes source="manual" and
--   grantedByUserId when granting or revoking a product entitlement.
--   These fields exist in the Convex schema but were missing from the
--   Supabase table, blocking the migration of ctx.db writes to
--   createSupabaseDb().
-- ============================================================

ALTER TABLE product_subscriptions
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS granted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
