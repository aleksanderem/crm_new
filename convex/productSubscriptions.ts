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
