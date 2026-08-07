-- ============================================================
-- Migration 00109: Add product_key to plans (closes #4096)
-- ============================================================
--
-- Context:
--   The plans table in Supabase was created without a product_key column.
--   The Convex schema (convex/schema/platform.ts) defines productKey as an
--   optional field on plans, supporting multi-module billing (crm, gabinet,
--   magazyn). The subscriptions table already received product_key in migration
--   00108; this migration keeps the plans table in sync.
--
--   The column is nullable to match the Convex optional field and to allow
--   legacy plans (pre-multi-module) to coexist without a backfill.
-- ============================================================

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS product_key TEXT;

-- Support the by_productAndKey index pattern used in Convex
-- (productKey + key lookup for plan discovery per module).
CREATE INDEX IF NOT EXISTS plans_product_key_key_idx
  ON plans (product_key, key);
