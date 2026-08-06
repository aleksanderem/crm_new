-- Fiscal receipt tracking fields on the payments table (issue #3738).
--
-- fiscal_receipt_id: ID returned by the fiscal device/service once the
--   receipt is printed. Stored for reference and potential void/refund calls.
--
-- fiscal_status: lifecycle of the fiscalisation attempt:
--   pending_fiscal — queued or in-flight; device has not confirmed yet.
--   fiscal_ok      — receipt successfully printed; fiscal_receipt_id is set.
--   fiscal_error   — all retries exhausted; fiscal_error column has details.
--
-- fiscal_attempts: how many times we tried to deliver this receipt.
--   Used to cap automatic retries at MAX_FISCAL_RETRIES (3).
--
-- fiscal_error: last device/service error message; populated when
--   fiscal_status is 'pending_fiscal' (transient) or 'fiscal_error'
--   (permanent). Overwritten on each attempt.
--
-- All columns are nullable so existing payment rows remain valid without
-- a backfill — unfiscalised payments simply have NULL fiscal_status.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS fiscal_receipt_id TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_status     TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_attempts   INTEGER,
  ADD COLUMN IF NOT EXISTS fiscal_error      TEXT;

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_fiscal_status_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_fiscal_status_check
  CHECK (
    fiscal_status IS NULL
    OR fiscal_status IN ('pending_fiscal', 'fiscal_ok', 'fiscal_error')
  );
