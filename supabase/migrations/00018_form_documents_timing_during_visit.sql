-- Issue #1943: add 'during_visit' timing for required documents.
--
-- Treatments can mark required form templates as needing to be filled at one
-- of three points relative to a visit: before, during, or after. Previously
-- only 'before_start' and 'after_completion' were allowed.

ALTER TABLE form_documents
  DROP CONSTRAINT IF EXISTS form_documents_timing_check;

ALTER TABLE form_documents
  ADD CONSTRAINT form_documents_timing_check
  CHECK (timing IS NULL OR timing IN ('before_start', 'during_visit', 'after_completion'));
