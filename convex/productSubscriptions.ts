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

    const active = subs
      .filter((s) => s.status === "active" || s.status === "trialing")
      .map((s) => s.productId);
    if (active.length > 0) return active;

    // Fallback: productSubscriptions data moved to Supabase during the migration
    // and the Convex table is empty, so this query returned [] for EVERY org —
    // which collapsed the left module navigation to nothing (getVisibleModules
    // filters to zero when given an empty array). Until entitlements are re-read
    // from Supabase, surface the full product catalog so navigation renders.
    // Consistent with verifyProductAccess failing open (see _helpers/products.ts).
    const products = await ctx.db.query("platformProducts").collect();
    return products.map((p) => p.productId);
  },
});
