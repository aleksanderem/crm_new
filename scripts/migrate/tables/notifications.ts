/**
 * Migration config: Convex `notifications` → PostgreSQL `notifications`
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

const notificationsConfig: TableMigrationConfig = {
  sourceTable: "notifications",
  targetTable: "notifications",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    refField("userId", "user_id"),
    field("type", "type"),
    field("title", "title"),
    field("message", "message"),
    field("link", "link"),
    field("isRead", "is_read"),
    timestampField("createdAt", "created_at"),
  ],
};

registerTable(notificationsConfig);

export default notificationsConfig;
