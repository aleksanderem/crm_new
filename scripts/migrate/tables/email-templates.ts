/**
 * Migration config: Convex `emailTemplates` → PostgreSQL `email_templates`
 *
 * Depends on: organizations, users (created_by)
 */

import {
  idField,
  refField,
  field,
  arrayField,
  jsonbField,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const emailTemplatesConfig: TableMigrationConfig = {
  sourceTable: "emailTemplates",
  targetTable: "email_templates",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("name", "name"),
    field("subject", "subject"),
    field("body", "body"),
    field("contentJson", "content_json"),
    field("renderedHtml", "rendered_html"),
    field("slug", "slug"),
    field("category", "category"),
    field("module", "module"),
    field("eventType", "event_type"),
    field("isSystem", "is_system"),
    field("locale", "locale"),
    arrayField("requiredSources", "required_sources"),
    jsonbField("variables", "variables"),
    refField("createdBy", "created_by"),
    field("isActive", "is_active"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(emailTemplatesConfig);

export default emailTemplatesConfig;
