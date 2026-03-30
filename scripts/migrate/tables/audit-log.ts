/**
 * Migration config: Convex `auditLog` → PostgreSQL `audit_log`
 *
 * Depends on: organizations (organization_id), users (user_id)
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const auditLogConfig: TableMigrationConfig = {
  sourceTable: "auditLog",
  targetTable: "audit_log",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    refField("userId", "user_id"),
    field("action", "action"),
    field("entityType", "entity_type"),
    field("entityId", "entity_id"),
    field("details", "details"),
    field("ipAddress", "ip_address"),
    timestampField("createdAt", "created_at"),
  ],
};

registerTable(auditLogConfig);

export default auditLogConfig;
