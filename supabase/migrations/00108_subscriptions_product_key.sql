-- ============================================================
-- Migration 00108: Add product_key to subscriptions (closes #4114)
-- ============================================================
--
-- Context:
--   The PREAUTH_createSubscription and PREAUTH_replaceSubscription guards
--   previously had to load all user subscriptions and then fetch each plan
--   row to find the matching productKey — an N+1 pattern that degrades as
--   users accumulate module subscriptions.
--
--   Denormalising productKey onto the subscriptions row and adding a
--   composite (user_id, product_key) index makes both lookups O(1).
-- ============================================================

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS product_key TEXT;

CREATE INDEX IF NOT EXISTS subscriptions_user_id_product_key_idx
  ON subscriptions (user_id, product_key);
