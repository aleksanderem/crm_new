-- ============================================================
-- Migration 00113: Add trial_end_date to subscriptions and
--   product_subscriptions (closes #4190)
-- ============================================================
--
-- Context:
--   Stripe sends a trial_end unix timestamp on every subscription object
--   (customer.subscription.created/updated, checkout.session.completed).
--   The webhook handlers previously only captured current_period_end, which
--   equals trial_end during a trial period but diverges if the trial is
--   manually extended in the Stripe dashboard. A dedicated column makes the
--   trial boundary explicit and survivable across period renewals.
--
--   The column is nullable: non-trial subscriptions have no trial_end.
-- ============================================================

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_end_date BIGINT;

ALTER TABLE product_subscriptions
  ADD COLUMN IF NOT EXISTS trial_end_date BIGINT;
