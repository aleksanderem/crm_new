/**
 * Migration config: Convex `activities` → PostgreSQL `activities`
 *
 * Depends on: users (performed_by), organizations
 */

import {
  idField,
  refField,
  field,
  jsonbField,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const activitiesConfig: TableMigrationConfig = {
  sourceTable: "activities",
  targetTable: "activities",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("entityType", "entity_type"),
    field("entityId", "entity_id"),
    field("action", "action"),
    field("description", "description"),
    jsonbField("metadata", "metadata"),
    refField("performedBy", "performed_by"),
    timestampField("createdAt", "created_at"),
  ],
};

registerTable(activitiesConfig);

export default activitiesConfig;
