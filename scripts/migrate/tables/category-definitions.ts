/**
 * Migration config: Convex `categoryDefinitions` → PostgreSQL `category_definitions`
 *
 * Depends on: organizations (organization_id)
 * Self-referencing FK: parent_id → category_definitions(id)
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const categoryDefinitionsConfig: TableMigrationConfig = {
  sourceTable: "categoryDefinitions",
  targetTable: "category_definitions",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("entityType", "entity_type"),
    field("name", "name"),
    refField("parentId", "parent_id"),
    field("color", "color"),
    field("icon", "icon"),
    field("sortOrder", "sort_order"),
    field("isDeleted", "is_deleted"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(categoryDefinitionsConfig);

export default categoryDefinitionsConfig;
