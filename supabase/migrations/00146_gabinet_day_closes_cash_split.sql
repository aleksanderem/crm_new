-- R2B (issue #5575): extend gabinet_day_closes with cash split at day close.
--
-- cashNextOpening — amount that stays in the register as the starting balance
--                   for the following day (same location).
-- cashToSafe      — amount physically moved to the location's safe (Sejf).
--
-- Invariant (enforced in Convex, not in SQL):
--   cash_next_opening + cash_to_safe = cash_counted
--
-- Columns are NULL for records created before this migration (historical
-- closes that never had the split concept). Do NOT backfill with 0.

ALTER TABLE gabinet_day_closes
  ADD COLUMN IF NOT EXISTS cash_next_opening NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS cash_to_safe      NUMERIC(12, 2);
