/**
 * Migration config: Convex `products` → PostgreSQL `products`
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

const productsConfig: TableMigrationConfig = {
  sourceTable: "products",
  targetTable: "products",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("name", "name"),
    field("sku", "sku"),
    field("unitPrice", "unit_price"),
    field("taxRate", "tax_rate"),
    field("isActive", "is_active"),
    field("description", "description"),
    arrayField("tagIds", "tag_ids"),
    refField("categoryId", "category_id"),
    refField("createdBy", "created_by"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(productsConfig);

export default productsConfig;
