/**
 * Migration config: Convex `sources` → PostgreSQL `sources`
 *
 * Depends on: users (created_by), organizations
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const sourcesConfig: TableMigrationConfig = {
  sourceTable: "sources",
  targetTable: "sources",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("name", "name"),
    field("order", "order"),
    field("isActive", "is_active"),
    refField("createdBy", "created_by"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(sourcesConfig);

export default sourcesConfig;
