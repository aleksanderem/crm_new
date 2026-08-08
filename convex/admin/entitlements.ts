import { v } from "convex/values";
import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { logAudit } from "../auditLog";

const productIdValidator = v.union(v.literal("crm"), v.literal("gabinet"));

// Convex-side upsert of a per-org product entitlement. Convex-only table.
const statusValidator = v.union(v.literal("active"), v.literal("canceled"));

export const _upsertEntitlement = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    productId: productIdValidator,
    grant: v.boolean(),
    grantedByUserId: v.id("users"),
  },
  returns: v.object({ status: statusValidator }),
  handler: async (ctx, args): Promise<{ status: "active" | "canceled" }> => {
    const status = args.grant ? "active" : "canceled";
    const now = Date.now();
    const existing = await ctx.db
      .query("productSubscriptions")
      .withIndex("by_orgAndProduct", (q) =>
        q.eq("organizationId", args.organizationId).eq("productId", args.productId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status,
        source: "manual",
        grantedByUserId: args.grantedByUserId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("productSubscriptions", {
        organizationId: args.organizationId,
        productId: args.productId,
        status,
        cancelAtPeriodEnd: false,
        source: "manual",
        grantedByUserId: args.grantedByUserId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.grantedByUserId,
      action: args.grant ? "product_access_granted" : "product_access_revoked",
      entityType: "productSubscription",
      entityId: args.productId,
    });

    return { status };
  },
});

// Platform-admin: grant or revoke a module for an org.
export const setEntitlement = action({
  args: {
    organizationId: v.id("organizations"),
    productId: productIdValidator,
    grant: v.boolean(),
  },
  returns: v.object({ status: statusValidator }),
  handler: async (ctx, args): Promise<{ status: "active" | "canceled" }> => {
    const { userId } = await ctx.runAction(
      internal._helpers.authAction.verifyPlatformAdmin,
      {},
    );
    return await ctx.runMutation(internal.admin.entitlements._upsertEntitlement, {
      organizationId: args.organizationId,
      productId: args.productId,
      grant: args.grant,
      grantedByUserId: userId,
    });
  },
});
