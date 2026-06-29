import { QueryCtx, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { GABINET_MODULES, GABINET_PRODUCT_ID, type GabinetModule } from "../gabinet/_registry";

/**
 * Verify that the organization has an active subscription for a specific product.
 * Throws if no active subscription exists.
 *
 * During development/MVP, if no productSubscriptions exist at all,
 * access is granted (grace period). Once the first productSubscription is created
 * for any org, enforcement begins.
 */
export async function verifyProductAccess(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  productId: string,
): Promise<void> {
  const subscription = await ctx.db
    .query("productSubscriptions")
    .withIndex("by_orgAndProduct", (q) =>
      q.eq("organizationId", organizationId).eq("productId", productId)
    )
    .first();

  if (!subscription) {
    // Grace period: if no subscriptions exist at all, allow access
    const anySubscription = await ctx.db
      .query("productSubscriptions")
      .first();
    if (!anySubscription) return; // no enforcement yet

    throw new Error(`No active subscription for product: ${productId}`);
  }

  if (subscription.status !== "active" && subscription.status !== "trialing") {
    throw new Error(`Subscription for ${productId} is ${subscription.status}`);
  }
}

/**
 * Verify that the organization has access to a specific gabinet sub-module.
 * Resolves the module name to its required product ID via GABINET_MODULES and
 * delegates to verifyProductAccess.
 *
 * Usage:
 *   await checkModuleAccess(ctx, organizationId, "inventory");
 *   await checkModuleAccess(ctx, organizationId, "patients");
 */
export async function checkModuleAccess(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  module: GabinetModule,
): Promise<void> {
  await verifyProductAccess(ctx, organizationId, GABINET_MODULES[module]);
}

/**
 * Internal query that action handlers can call via ctx.runQuery() to verify
 * gabinet product access. Actions receive ActionCtx (not QueryCtx) so they
 * cannot call verifyProductAccess directly.
 */
export const verifyGabinetAccess = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
  },
});
