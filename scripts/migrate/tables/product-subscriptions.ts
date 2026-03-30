/**
 * Migration config: Convex `productSubscriptions` → PostgreSQL `product_subscriptions`
 *
 * Depends on: organizations (organization_id)
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const productSubscriptionsConfig: TableMigrationConfig = {
  sourceTable: "productSubscriptions",
  targetTable: "product_subscriptions",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("productId", "product_id"),
    field("stripeSubscriptionId", "stripe_subscription_id"),
    field("status", "status"),
    timestampField("currentPeriodStart", "current_period_start"),
    timestampField("currentPeriodEnd", "current_period_end"),
    field("cancelAtPeriodEnd", "cancel_at_period_end"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(productSubscriptionsConfig);

export default productSubscriptionsConfig;
