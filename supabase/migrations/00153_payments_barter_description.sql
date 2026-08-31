-- Add barter_description column to payments (issue #5665).
--
-- Required at the application layer when payment_method = 'barter'.
-- NULL is intentionally allowed at the DB level so legacy rows remain
-- valid; the mandatory-description constraint lives in convex/payments.ts.
-- Symmetric with gratis_reason added in migration 00152.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS barter_description TEXT;
