/**
 * Migration config: Convex `objectRelationships` → PostgreSQL `object_relationships`
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

const objectRelationshipsConfig: TableMigrationConfig = {
  sourceTable: "objectRelationships",
  targetTable: "object_relationships",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("sourceType", "source_type"),
    field("sourceId", "source_id"),
    field("targetType", "target_type"),
    field("targetId", "target_id"),
    field("relationshipType", "relationship_type"),
    refField("createdBy", "created_by"),
    timestampField("createdAt", "created_at"),
  ],
};

registerTable(objectRelationshipsConfig);

export default objectRelationshipsConfig;
