/**
 * Migration config: Convex `lostReasons` → PostgreSQL `lost_reasons`
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

const lostReasonsConfig: TableMigrationConfig = {
  sourceTable: "lostReasons",
  targetTable: "lost_reasons",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("label", "label"),
    field("order", "order"),
    field("isActive", "is_active"),
    refField("createdBy", "created_by"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(lostReasonsConfig);

export default lostReasonsConfig;
