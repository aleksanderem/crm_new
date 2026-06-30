-- Drop legacy gabinet document tables that were superseded by formTemplates/formDocuments
-- Data migration to documentTemplates/documentInstances was handled by migrateGabinetDocuments
-- (convex/migrations/migrateGabinetDocuments.ts) before this migration was applied.

DROP TABLE IF EXISTS gabinet_documents;
DROP TABLE IF EXISTS gabinet_document_templates;
