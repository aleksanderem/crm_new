-- Add template_version column to form_documents.
-- Records the formTemplates.version value at the moment a document is created,
-- so historical documents can be unambiguously tied to the exact template
-- version the patient saw/signed, even after subsequent in-place edits bump
-- the template's version counter.
-- Nullable because rows created before this migration have no captured version;
-- those rows can fall back to querying the template's current version as a
-- best-effort approximation.
ALTER TABLE form_documents
  ADD COLUMN IF NOT EXISTS template_version INTEGER;
