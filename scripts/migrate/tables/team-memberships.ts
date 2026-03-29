/**
 * Migration config: Convex `teamMemberships` → PostgreSQL `team_memberships`
 *
 * Depends on: users (user_id, invited_by), organizations (organization_id)
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const teamMembershipsConfig: TableMigrationConfig = {
  sourceTable: "teamMemberships",
  targetTable: "team_memberships",
  fields: [
    idField(),
    refField("userId", "user_id"),
    refField("organizationId", "organization_id"),
    field("role", "role"),
    refField("invitedBy", "invited_by"),
    timestampField("joinedAt", "joined_at"),
  ],
};

registerTable(teamMembershipsConfig);

export default teamMembershipsConfig;
