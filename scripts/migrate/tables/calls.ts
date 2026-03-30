/**
 * Migration config: Convex `calls` → PostgreSQL `calls`
 *
 * Depends on: users (created_by), organizations, category_definitions
 */

import {
  idField,
  refField,
  field,
  arrayField,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const callsConfig: TableMigrationConfig = {
  sourceTable: "calls",
  targetTable: "calls",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("outcome", "outcome"),
    timestampField("callDate", "call_date"),
    field("note", "note"),
    field("duration", "duration"),
    arrayField("tagIds", "tag_ids"),
    refField("categoryId", "category_id"),
    refField("createdBy", "created_by"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(callsConfig);

export default callsConfig;
