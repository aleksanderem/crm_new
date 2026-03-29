/**
 * Migration config: Convex `organizations` → PostgreSQL `organizations`
 *
 * Depends on: users (owner_id FK)
 */

import {
  field,
  idField,
  refField,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const organizationsConfig: TableMigrationConfig = {
  sourceTable: "organizations",
  targetTable: "organizations",
  fields: [
    idField(),
    field("name", "name"),
    field("slug", "slug"),
    refField("ownerId", "owner_id"),
    field("logo", "logo"),
    field("website", "website"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
    field("onboardingCompleted", "onboarding_completed"),
  ],
};

registerTable(organizationsConfig);

export default organizationsConfig;
