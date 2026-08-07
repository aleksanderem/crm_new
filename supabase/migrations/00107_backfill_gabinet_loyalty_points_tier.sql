-- Backfill tier for existing gabinet_loyalty_points rows (#4086).
--
-- Rows created before issue #4078 (which added tier calculation on every
-- points change) have tier = NULL.  This migration sets tier based on
-- lifetime_earned using the same hardcoded thresholds as calculateLoyaltyTier()
-- in convex/gabinet/_helpers/loyaltyTier.ts:
--   platinum: lifetime_earned >= 1000
--   gold:     lifetime_earned >= 500
--   silver:   lifetime_earned >= 200
--   bronze:   lifetime_earned >= 0 (default)
--
-- Only touches rows where tier IS NULL; already-populated rows are untouched.
-- Orgs that have since configured custom tiers will naturally get the correct
-- tier recalculated on the patient's next earn/spend/adjust action.

UPDATE gabinet_loyalty_points
SET tier = CASE
  WHEN lifetime_earned >= 1000 THEN 'platinum'::gabinet_loyalty_tier_enum
  WHEN lifetime_earned >= 500  THEN 'gold'::gabinet_loyalty_tier_enum
  WHEN lifetime_earned >= 200  THEN 'silver'::gabinet_loyalty_tier_enum
  ELSE                              'bronze'::gabinet_loyalty_tier_enum
END
WHERE tier IS NULL;
