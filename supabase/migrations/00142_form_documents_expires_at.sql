-- D27: Add expires_at and document_validity_days to form_documents.
--
-- expires_at: computed at signing time — signedAt + documentValidityDays * 86400000 ms.
--   NULL means the document does not expire (once / before_each_visit frequency rules).
-- document_validity_days: snapshot of the validityDays from the treatment rule at
--   document creation time. Stored so that later config changes never retroactively
--   alter the validity of already-issued documents.

ALTER TABLE form_documents
  ADD COLUMN expires_at            BIGINT,
  ADD COLUMN document_validity_days INTEGER;

CREATE INDEX form_documents_expires_at_idx
  ON form_documents (expires_at)
  WHERE expires_at IS NOT NULL;
