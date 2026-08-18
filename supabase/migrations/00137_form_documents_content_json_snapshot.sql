-- Add content_json_snapshot to form_documents.
-- Stores the formTemplate.contentJson (TipTap document JSON) at the moment a
-- document is created, so the signing page and viewers always render from the
-- historical snapshot rather than the live (potentially edited) template.
-- Nullable for rows created before this migration; those fall back to querying
-- the current template's contentJson as a best-effort approximation.
ALTER TABLE form_documents
  ADD COLUMN IF NOT EXISTS content_json_snapshot TEXT;
