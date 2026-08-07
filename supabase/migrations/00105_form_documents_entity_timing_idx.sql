-- Add composite index on form_documents(entity_type, entity_id, timing, auto_generated).
--
-- The gate query that runs at appointment status transitions filters on all four
-- columns. The existing form_documents_entity_idx covers only (entity_type, entity_id),
-- so Postgres has to scan every document for the appointment and then filter by timing
-- and auto_generated in a second pass. The new index lets the planner satisfy the
-- entire predicate from the index, making the lookup O(1) instead of a filtered scan
-- over all documents for that entity. Closes #3834.

CREATE INDEX form_documents_entity_timing_idx
  ON form_documents (entity_type, entity_id, timing, auto_generated);
