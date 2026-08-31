-- Add gratis_reason column to payments (issue #5659).
--
-- Required at the application layer when payment_method = 'gratis'.
-- NULL is intentionally allowed at the DB level so legacy rows remain
-- valid; the mandatory-reason constraint lives in convex/payments.ts.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gratis_reason TEXT;
