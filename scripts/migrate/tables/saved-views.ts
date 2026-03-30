/**
 * Migration config: Convex `savedViews` → PostgreSQL `saved_views`
 *
 * Depends on: users (created_by), organizations
 */

import {
  idField,
  refField,
  field,
  jsonbField,
  arrayField,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const savedViewsConfig: TableMigrationConfig = {
  sourceTable: "savedViews",
  targetTable: "saved_views",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("entityType", "entity_type"),
    field("name", "name"),
    jsonbField("filters", "filters"),
    arrayField("columns", "columns"),
    field("sortField", "sort_field"),
    field("sortDirection", "sort_direction"),
    field("isDefault", "is_default"),
    field("isSystem", "is_system"),
    refField("createdBy", "created_by"),
    field("order", "order"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(savedViewsConfig);

export default savedViewsConfig;
