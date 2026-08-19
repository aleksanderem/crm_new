-- Drop document_template_fields and document_templates tables.
-- The Convex actions and schema for these tables were removed in #5404/#5411.
-- No rows are created in production (documentInstances.create had no frontend
-- callers), so the tables are safe to drop.
--
-- Safety audit: verify all document_instances.template_id rows are NULL before
-- dropping the referenced table.  The FK constraint blocks the DROP otherwise.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM document_instances WHERE template_id IS NOT NULL LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'Cannot drop document_templates: document_instances has rows with non-NULL template_id';
  END IF;
END;
$$;

-- Drop the FK from document_instances before dropping the parent table.
ALTER TABLE document_instances
  DROP CONSTRAINT IF EXISTS document_instances_template_id_fkey;

-- document_template_fields has a FK on document_templates; drop child first.
DROP TABLE IF EXISTS document_template_fields;
DROP TABLE IF EXISTS document_templates;
