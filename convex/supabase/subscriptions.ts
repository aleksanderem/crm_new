/**
 * Convex → Supabase Subscriptions Dual-Write Action
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeSubscriptionToSupabase = internalAction({
  args: {
    subscriptionId: v.string(),
    userId: v.string(),
    planId: v.string(),
    productKey: v.optional(v.string()),
    priceStripeId: v.string(),
    stripeId: v.string(),
    currency: v.string(),
    interval: v.string(),
    status: v.string(),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();

    const row = {
      id: args.subscriptionId,
      user_id: args.userId,
      plan_id: args.planId,
      product_key: args.productKey ?? null,
      price_stripe_id: args.priceStripeId,
      stripe_id: args.stripeId,
      currency: args.currency,
      interval: args.interval,
      status: args.status,
      current_period_start: args.currentPeriodStart,
      current_period_end: args.currentPeriodEnd,
      cancel_at_period_end: args.cancelAtPeriodEnd,
    };

    const data = await upsertWithFkRetry(client, "subscriptions", row)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`supabaseDb.insert(subscriptions): ${msg}`);
      });

    console.info(`Subscription written to Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});
