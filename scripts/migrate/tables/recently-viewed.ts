/**
 * Migration config: Convex `recentlyViewed` → PostgreSQL `recently_viewed`
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

const recentlyViewedConfig: TableMigrationConfig = {
  sourceTable: "recentlyViewed",
  targetTable: "recently_viewed",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    refField("userId", "user_id"),
    field("entityType", "entity_type"),
    field("entityId", "entity_id"),
    field("entityLabel", "entity_label"),
    timestampField("viewedAt", "viewed_at"),
  ],
};

registerTable(recentlyViewedConfig);

export default recentlyViewedConfig;
