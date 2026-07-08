-- Backfill scope_entities for existing appointment form_documents.
--
-- Documents auto-generated after #2823 already have scope_entities populated.
-- Rows created before that fix have scope_entities IS NULL, so the JSONB
-- containment query (scope_entities @> '{"patient":"<id>"}') used by the
-- patient card intake summary cannot find them.
--
-- This is a one-time UPDATE: only rows with entity_type='appointment' and
-- scope_entities IS NULL are touched. Rows already populated are left alone.

UPDATE form_documents fd
SET    scope_entities = jsonb_build_object('patient', ga.patient_id)
FROM   gabinet_appointments ga
WHERE  fd.entity_id      = ga.id
  AND  fd.entity_type    = 'appointment'
  AND  fd.scope_entities IS NULL;
