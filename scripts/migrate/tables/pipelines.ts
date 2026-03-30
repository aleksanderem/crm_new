/**
 * Migration config: Convex `pipelines` → PostgreSQL `pipelines`
 *
 * Depends on: users (created_by), organizations (organization_id)
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const pipelinesConfig: TableMigrationConfig = {
  sourceTable: "pipelines",
  targetTable: "pipelines",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("name", "name"),
    field("description", "description"),
    field("type", "type"),
    field("isDefault", "is_default"),
    refField("createdBy", "created_by"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(pipelinesConfig);

export default pipelinesConfig;
