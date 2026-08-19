-- Add refund tracking columns to the payments table (issue #5591).
--
-- refund_amount: the amount actually returned to the patient. For a full refund
--   this equals `amount`; for a partial refund (future path) it may be less.
--   Kept separate from `amount` so the original charge is preserved for audit.
--
-- refunded_at: epoch-ms timestamp when the refund was processed. Allows
--   time-bounded net-revenue queries without parsing the `notes` column.
--
-- Both columns are nullable so existing rows remain valid without a backfill —
-- payments that were marked refunded before this migration simply have NULL
-- in both columns.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS refunded_at   BIGINT;

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_refund_amount_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_refund_amount_check
  CHECK (refund_amount IS NULL OR refund_amount > 0);
