-- Patient credit / overpayment carry-forward (issue #1059).
--
-- Two new columns on `payments` track credit accounting:
--   credit_earned   numeric — overpayment portion that became patient credit
--                            (negative on credit-refund rows that drain the
--                            balance back to the patient as cash)
--   credit_applied  numeric — pre-existing credit consumed by this payment to
--                            settle a visit (does NOT add to `amount`)
--
-- A nullable `kind` column distinguishes ordinary payments from bookkeeping
-- rows produced by `refundCredit` so reports can filter them out.
--
-- All three columns are nullable so existing rows remain valid without
-- backfill. Patient credit balance is derived from completed/pending payments
-- as: SUM(coalesce(credit_earned, 0) - coalesce(credit_applied, 0)).

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS credit_earned NUMERIC,
  ADD COLUMN IF NOT EXISTS credit_applied NUMERIC,
  ADD COLUMN IF NOT EXISTS kind TEXT;

-- Restrict `kind` values to the allowed discriminators. Existing NULLs are
-- treated as "payment".
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_kind_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_kind_check
  CHECK (kind IS NULL OR kind IN ('payment', 'credit_refund'));

-- Composite index used by getPatientCredit to scan completed rows per patient.
CREATE INDEX IF NOT EXISTS payments_org_patient_status_idx
  ON payments (organization_id, patient_id, status);
