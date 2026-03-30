/**
 * Migration config: Convex `emailSequences` → PostgreSQL `email_sequences`
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

const emailSequencesConfig: TableMigrationConfig = {
  sourceTable: "emailSequences",
  targetTable: "email_sequences",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("name", "name"),
    field("triggerEventType", "trigger_event_type"),
    field("isActive", "is_active"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(emailSequencesConfig);

export default emailSequencesConfig;
