-- Store discount on payment records (issue #3383).
--
-- Discounts are currently a UI-only computation: admins viewing payment history
-- see only the final amount with no indication a discount was granted.
-- Adding discount_amount and discount_percent makes discounts auditable.
--
-- Both columns are nullable so existing rows remain valid without backfill.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS discount_amount  NUMERIC,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC;

-- Optional: ensure percent is within a sane range when present.
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_discount_percent_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_discount_percent_check
  CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100));
