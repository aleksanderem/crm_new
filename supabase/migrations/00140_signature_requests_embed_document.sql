-- Embed document metadata directly in signature_requests so the table can be
-- decoupled from document_instances (issue #5417).
-- Columns added:
--   document_title      — human-readable title shown on the signing page
--   rendered_content    — HTML shown for review on the signing page (nullable)
--   document_created_by — user ID of the document author (for signed notifications)
--   slot_label          — display label for this signature slot
--   signature_data      — the actual signature value recorded at sign time
ALTER TABLE signature_requests
  ADD COLUMN document_title      TEXT NOT NULL DEFAULT '',
  ADD COLUMN rendered_content    TEXT,
  ADD COLUMN document_created_by TEXT,
  ADD COLUMN slot_label          TEXT,
  ADD COLUMN signature_data      TEXT;

-- Backfill embedded fields from still-present document_instances rows.
UPDATE signature_requests sr
SET
  document_title      = COALESCE(di.title, ''),
  rendered_content    = di.rendered_content,
  document_created_by = di.created_by
FROM document_instances di
WHERE sr.instance_id = di.id;
