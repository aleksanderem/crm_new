import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

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
