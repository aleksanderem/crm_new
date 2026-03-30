/**
 * Migration config: Convex `subscriptions` → PostgreSQL `subscriptions`
 *
 * Depends on: users (user_id), plans (plan_id)
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const subscriptionsConfig: TableMigrationConfig = {
  sourceTable: "subscriptions",
  targetTable: "subscriptions",
  fields: [
    idField(),
    refField("userId", "user_id"),
    refField("planId", "plan_id"),
    field("priceStripeId", "price_stripe_id"),
    field("stripeId", "stripe_id"),
    field("currency", "currency"),
    field("interval", "interval"),
    field("status", "status"),
    timestampField("currentPeriodStart", "current_period_start"),
    timestampField("currentPeriodEnd", "current_period_end"),
    field("cancelAtPeriodEnd", "cancel_at_period_end"),
  ],
};

registerTable(subscriptionsConfig);

export default subscriptionsConfig;
