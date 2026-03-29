/**
 * Migration config: Convex `contacts` → PostgreSQL `contacts`
 *
 * Depends on: users (created_by), organizations (organization_id),
 *             tag_definitions (tag_ids), category_definitions (category_id)
 *
 * NOTE: `search_vector` is a GENERATED ALWAYS column in PostgreSQL —
 * it must NOT be included in the insert payload.
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

const contactsConfig: TableMigrationConfig = {
  sourceTable: "contacts",
  targetTable: "contacts",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("firstName", "first_name"),
    field("lastName", "last_name"),
    field("email", "email"),
    field("phone", "phone"),
    field("title", "title"),
    field("avatarUrl", "avatar_url"),
    field("notes", "notes"),
    arrayField("tags", "tags"),
    arrayField("tagIds", "tag_ids"),
    refField("categoryId", "category_id"),
    field("source", "source"),
    refField("createdBy", "created_by"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(contactsConfig);

export default contactsConfig;
