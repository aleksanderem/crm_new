/**
 * Migration config: Convex `documents` → PostgreSQL `documents`
 *
 * Depends on: users (created_by), organizations, category_definitions
 */

import {
  idField,
  refField,
  field,
  arrayField,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const documentsConfig: TableMigrationConfig = {
  sourceTable: "documents",
  targetTable: "documents",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("name", "name"),
    field("description", "description"),
    field("fileId", "file_id"),
    field("fileUrl", "file_url"),
    field("mimeType", "mime_type"),
    field("fileSize", "file_size"),
    field("category", "category"),
    arrayField("tags", "tags"),
    arrayField("tagIds", "tag_ids"),
    refField("categoryId", "category_id"),
    field("status", "status"),
    field("amount", "amount"),
    timestampField("sentAt", "sent_at"),
    timestampField("acceptedAt", "accepted_at"),
    refField("createdBy", "created_by"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(documentsConfig);

export default documentsConfig;
