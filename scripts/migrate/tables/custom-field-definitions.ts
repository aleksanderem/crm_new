/**
 * Migration config: Convex `customFieldDefinitions` → PostgreSQL `custom_field_definitions`
 *
 * Depends on: organizations
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

const customFieldDefinitionsConfig: TableMigrationConfig = {
  sourceTable: "customFieldDefinitions",
  targetTable: "custom_field_definitions",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("entityType", "entity_type"),
    field("name", "name"),
    field("fieldKey", "field_key"),
    field("fieldType", "field_type"),
    arrayField("options", "options"),
    field("isRequired", "is_required"),
    field("order", "order"),
    field("group", "group"),
    field("activityTypeKey", "activity_type_key"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(customFieldDefinitionsConfig);

export default customFieldDefinitionsConfig;
