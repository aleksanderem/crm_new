/**
 * Migration config: Convex `activityTypeDefinitions` → PostgreSQL `activity_type_definitions`
 *
 * Depends on: organizations (organization_id)
 *
 * NOTE: `order` is a reserved word in PostgreSQL — the PG schema uses
 * quoted `"order"` column name. The migration framework handles this
 * transparently since it uses parameterized inserts via Supabase client.
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const activityTypeDefinitionsConfig: TableMigrationConfig = {
  sourceTable: "activityTypeDefinitions",
  targetTable: "activity_type_definitions",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("key", "key"),
    field("name", "name"),
    field("icon", "icon"),
    field("color", "color"),
    field("isSystem", "is_system"),
    field("order", "order"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(activityTypeDefinitionsConfig);

export default activityTypeDefinitionsConfig;
