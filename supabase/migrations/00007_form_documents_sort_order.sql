-- Add sort_order to form_documents for drag-and-drop reordering of documents
-- on entity detail "Documents" tabs (patient, appointment, treatment, lead,
-- contact, company, employee). Issue #1107.
--
-- Nullable: existing rows fall back to createdAt ordering in the list query.

ALTER TABLE form_documents
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

CREATE INDEX IF NOT EXISTS form_documents_entity_sort_idx
  ON form_documents (entity_type, entity_id, sort_order);
