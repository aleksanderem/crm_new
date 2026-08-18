-- D31: Complete document audit trail
-- Adds who-sent and who-voided tracking to form_documents so every lifecycle
-- event (created, sent, signed, voided) has both a user ID (stored on the row
-- and written to audit_log) and a timestamp.
ALTER TABLE form_documents
  ADD COLUMN IF NOT EXISTS sent_by_user_id   text,
  ADD COLUMN IF NOT EXISTS voided_by_user_id text,
  ADD COLUMN IF NOT EXISTS voided_at         bigint;
