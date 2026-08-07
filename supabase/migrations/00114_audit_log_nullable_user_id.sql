-- Make audit_log.user_id nullable so system-originated events (e.g. document
-- signing triggered by a patient via a signing token, where the document has
-- no createdBy) can be recorded without a user FK target.
-- Closes: #4213
ALTER TABLE audit_log ALTER COLUMN user_id DROP NOT NULL;
