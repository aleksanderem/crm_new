/**
 * Migration config: Convex `automationRules` → PostgreSQL `automation_rules`
 *
 * Depends on: organizations (organization_id), users (created_by)
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

const automationRulesConfig: TableMigrationConfig = {
  sourceTable: "automationRules",
  targetTable: "automation_rules",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("name", "name"),
    field("description", "description"),
    field("module", "module"),
    field("eventType", "event_type"),
    field("entityType", "entity_type"),
    jsonbField("trigger", "trigger"),
    jsonbField("graph", "graph"),
    field("definitionVersion", "definition_version"),
    jsonbField("conditions", "conditions"),
    jsonbField("actions", "actions"),
    field("enabled", "enabled"),
    refField("createdBy", "created_by"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(automationRulesConfig);

export default automationRulesConfig;
