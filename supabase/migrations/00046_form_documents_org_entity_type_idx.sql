-- Add composite index on form_documents(organization_id, entity_type).
--
-- getLatestSignedIntakeByPatient runs two queries that both filter on
-- organization_id + entity_type. The existing single-column org index forces
-- Postgres to scan all org rows before filtering by entity_type. This index
-- lets the planner narrow to the exact (org, entity_type) slice first, after
-- which the GIN scope_entities containment check operates on a much smaller
-- working set. Closes #2831.

CREATE INDEX form_documents_org_entity_type_idx
  ON form_documents (organization_id, entity_type);
