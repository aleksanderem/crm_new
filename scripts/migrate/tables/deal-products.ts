/**
 * Migration config: Convex `dealProducts` → PostgreSQL `deal_products`
 *
 * Depends on: organizations, leads (deal_id), products (product_id)
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const dealProductsConfig: TableMigrationConfig = {
  sourceTable: "dealProducts",
  targetTable: "deal_products",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    refField("dealId", "deal_id"),
    refField("productId", "product_id"),
    field("quantity", "quantity"),
    field("unitPrice", "unit_price"),
    field("discount", "discount"),
    timestampField("createdAt", "created_at"),
  ],
};

registerTable(dealProductsConfig);

export default dealProductsConfig;
