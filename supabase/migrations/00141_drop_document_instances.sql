-- Drop document_instances and free signature_requests from its FK.
-- Prerequisite: migration 00140 must have run so existing signing links
-- already carry their own document_title / rendered_content.
--
-- Steps:
--   1. Drop the FK constraint that chains signature_requests to document_instances
--      (otherwise dropping the parent table would cascade-delete all signing rows).
--   2. Make instance_id nullable — future requests are no longer tied to an instance row.
--   3. Drop document_instances and the associated status enum.

ALTER TABLE signature_requests
  DROP CONSTRAINT IF EXISTS signature_requests_instance_id_fkey,
  ALTER COLUMN instance_id DROP NOT NULL;

DROP TABLE IF EXISTS document_instances;
DROP TYPE IF EXISTS document_instance_status_enum;
