/**
 * Migration config: Convex `users` → PostgreSQL `users`
 *
 * FK target for: organizations.owner_id, contacts.created_by,
 * team_memberships.user_id, etc.
 * No FK dependencies — migrated first.
 */

import {
  field,
  fieldWithTransform,
  idField,
  creationTimeField,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const usersConfig: TableMigrationConfig = {
  sourceTable: "users",
  targetTable: "users",
  fields: [
    idField(),
    field("name", "name"),
    field("username", "username"),
    field("imageId", "image_storage_id"),
    field("image", "image"),
    field("email", "email"),
    timestampField("emailVerificationTime", "email_verification_time"),
    field("phone", "phone"),
    timestampField("phoneVerificationTime", "phone_verification_time"),
    field("isAnonymous", "is_anonymous"),
    field("customerId", "customer_id"),
    field("language", "language"),
    field("theme", "theme"),
    field("timezone", "timezone"),
    creationTimeField("created_at"),
    // users table has no explicit updatedAt in Convex; use _creationTime as fallback
    fieldWithTransform("_creationTime", "updated_at", (v, row) => {
      const raw = row.updatedAt ?? row._creationTime;
      return typeof raw === "number" ? Math.round(raw) : null;
    }),
  ],
};

registerTable(usersConfig);

export default usersConfig;
