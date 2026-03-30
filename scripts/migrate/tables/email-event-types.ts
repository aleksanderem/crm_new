/**
 * Migration config: Convex `emailEventTypes` → PostgreSQL `email_event_types`
 *
 * Depends on: organizations
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const emailEventTypesConfig: TableMigrationConfig = {
  sourceTable: "emailEventTypes",
  targetTable: "email_event_types",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("eventType", "event_type"),
    field("module", "module"),
    field("displayName", "display_name"),
    field("description", "description"),
    field("payloadSchema", "payload_schema"),
    field("isActive", "is_active"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(emailEventTypesConfig);

export default emailEventTypesConfig;
