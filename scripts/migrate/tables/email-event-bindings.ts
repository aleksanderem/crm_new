/**
 * Migration config: Convex `emailEventBindings` → PostgreSQL `email_event_bindings`
 *
 * Depends on: organizations, email_templates (template_id), users (created_by)
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const emailEventBindingsConfig: TableMigrationConfig = {
  sourceTable: "emailEventBindings",
  targetTable: "email_event_bindings",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("eventType", "event_type"),
    refField("templateId", "template_id"),
    field("enabled", "enabled"),
    field("priority", "priority"),
    field("conditions", "conditions"),
    refField("createdBy", "created_by"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(emailEventBindingsConfig);

export default emailEventBindingsConfig;
