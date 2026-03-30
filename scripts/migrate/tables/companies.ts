/**
 * Migration config: Convex `companies` → PostgreSQL `companies`
 *
 * Depends on: users (created_by), organizations (organization_id),
 *             tag_definitions (tag_ids), category_definitions (category_id)
 */

import {
  idField,
  refField,
  field,
  arrayField,
  jsonbField,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const companiesConfig: TableMigrationConfig = {
  sourceTable: "companies",
  targetTable: "companies",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("name", "name"),
    field("domain", "domain"),
    field("industry", "industry"),
    field("size", "size"),
    field("website", "website"),
    field("phone", "phone"),
    jsonbField("address", "address"),
    field("notes", "notes"),
    arrayField("tags", "tags"),
    arrayField("tagIds", "tag_ids"),
    refField("categoryId", "category_id"),
    refField("createdBy", "created_by"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(companiesConfig);

export default companiesConfig;
