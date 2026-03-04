import { query } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

export const getActiveProducts = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const subs = await ctx.db
      .query("productSubscriptions")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // If no subscriptions exist at all, return all products (grace period)
    if (subs.length === 0) {
      return ["crm", "gabinet"];
    }

    return subs
      .filter((s) => s.status === "active" || s.status === "trialing")
      .map((s) => s.productId);
  },
});

export const getSubscription = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    // Check for user's subscription (plans are per-user, not per-org)
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!subscription) {
      // No active subscription - return default free tier
      return {
        seatLimit: 5,
        status: "free" as const,
        productId: null,
      };
    }

    // Get plan details for seat limit
    const plan = await ctx.db.get(subscription.planId);
    const seatLimit = plan?.seatLimit ?? 10;

    return {
      seatLimit,
      status: subscription.status as "active" | "trialing",
      productId: null,
    };
  },
});
