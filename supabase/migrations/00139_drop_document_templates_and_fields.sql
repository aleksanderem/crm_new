-- Drop document_template_fields and document_templates tables.
-- The Convex actions and schema for these tables were removed in #5404/#5411.
-- No rows are created in production (documentInstances.create had no frontend
-- callers), so the tables are safe to drop.
-- document_template_fields has a FK on document_templates; drop child first.
DROP TABLE IF EXISTS document_template_fields;
DROP TABLE IF EXISTS document_templates;
