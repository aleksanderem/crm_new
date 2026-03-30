/**
 * Migration config: Convex `customFieldValues` → PostgreSQL `custom_field_values`
 *
 * Depends on: organizations, custom_field_definitions (field_definition_id)
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

const customFieldValuesConfig: TableMigrationConfig = {
  sourceTable: "customFieldValues",
  targetTable: "custom_field_values",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    refField("fieldDefinitionId", "field_definition_id"),
    field("entityType", "entity_type"),
    field("entityId", "entity_id"),
    jsonbField("value", "value"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(customFieldValuesConfig);

export default customFieldValuesConfig;
