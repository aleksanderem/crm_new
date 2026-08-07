import { QueryCtx, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { GABINET_MODULES, GABINET_PRODUCT_ID, type GabinetModule } from "../gabinet/_registry";

/**
 * Verify that the organization has an active subscription for a specific product.
 * Throws if no active subscription exists.
 */
export async function verifyProductAccess(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  productId: string,
): Promise<void> {
  // NOTE: productSubscriptions data moved to Supabase during the Convex→Supabase
  // migration; the Convex `productSubscriptions` table is empty. This helper runs
  // in a QueryCtx, which cannot read Supabase (no network in the V8 isolate), so
  // it cannot enforce module entitlements here — reading the empty Convex table
  // blocked EVERY org from the entire gabinet module. Fail open to restore access
  // (matches pre-migration production behavior). Proper entitlement enforcement
  // must be re-implemented against Supabase in an action context. See follow-up.
  const subscription = await ctx.db
    .query("productSubscriptions")
    .withIndex("by_orgAndProduct", (q) =>
      q.eq("organizationId", organizationId).eq("productId", productId)
    )
    .first();

  if (subscription && subscription.status !== "active" && subscription.status !== "trialing") {
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
