/**
 * Migration config: Convex `invitations` → PostgreSQL `invitations`
 *
 * Depends on: organizations (organization_id), users (invited_by)
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const invitationsConfig: TableMigrationConfig = {
  sourceTable: "invitations",
  targetTable: "invitations",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("email", "email"),
    field("role", "role"),
    field("token", "token"),
    field("status", "status"),
    refField("invitedBy", "invited_by"),
    timestampField("expiresAt", "expires_at"),
    timestampField("acceptedAt", "accepted_at"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(invitationsConfig);

export default invitationsConfig;
