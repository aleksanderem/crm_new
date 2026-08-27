-- Drop document_template_fields and document_templates tables.
-- The Convex actions and schema for these tables were removed in #5404/#5411;
-- superseded by form_templates / form_documents (74+32 live rows in prod).
--
-- The original version RAISEd if any document_instances.template_id was non-NULL,
-- assuming prod had no rows. Prod actually has 18 templates + 8 instances (all
-- legacy, org kx79...). Those were investigated and BACKED UP before this change
-- (local export 2026-08-27). document_instances is itself dropped in 00141, and
-- 00140 first embeds the signing-relevant fields (document_title/rendered_content)
-- into signature_requests so the 3 live pending signing links survive. The FK is
-- dropped just below before the table drop, so no orphaning occurs. The guard is
-- therefore obsolete and removed so the deprecation can proceed.

-- Drop the FK from document_instances before dropping the parent table.
ALTER TABLE document_instances
  DROP CONSTRAINT IF EXISTS document_instances_template_id_fkey;

-- document_template_fields has a FK on document_templates; drop child first.
DROP TABLE IF EXISTS document_template_fields;
DROP TABLE IF EXISTS document_templates;
