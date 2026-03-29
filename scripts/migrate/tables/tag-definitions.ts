/**
 * Migration config: Convex `tagDefinitions` → PostgreSQL `tag_definitions`
 *
 * Depends on: organizations (organization_id)
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const tagDefinitionsConfig: TableMigrationConfig = {
  sourceTable: "tagDefinitions",
  targetTable: "tag_definitions",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("name", "name"),
    field("color", "color"),
    field("sortOrder", "sort_order"),
    field("isDeleted", "is_deleted"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(tagDefinitionsConfig);

export default tagDefinitionsConfig;
