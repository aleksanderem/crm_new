import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { logAudit } from "../auditLog";
import { createSupabaseDb } from "../_helpers/supabaseDb";

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

type EntStatus = "active" | "canceled" | "none";

const entStatusValidator = v.union(
  v.literal("active"),
  v.literal("canceled"),
  v.literal("none"),
);

const entitlementRowValidator = v.object({
  organizationId: v.string(),
  productId: v.string(),
  status: v.string(),
});

const orgEntitlementRowValidator = v.object({
  organizationId: v.string(),
  name: v.string(),
  memberCount: v.number(),
  crm: entStatusValidator,
  gabinet: entStatusValidator,
});

export const _listEntitlementsInternal = internalQuery({
  args: {},
  returns: v.array(entitlementRowValidator),
  handler: async (
    ctx,
  ): Promise<Array<{ organizationId: string; productId: string; status: string }>> => {
    const rows = await ctx.db.query("productSubscriptions").collect();
    return rows.map((r) => ({
      organizationId: String(r.organizationId),
      productId: r.productId,
      status: r.status,
    }));
  },
});

export const listOrgEntitlements = action({
  args: {},
  returns: v.array(orgEntitlementRowValidator),
  handler: async (
    ctx,
  ): Promise<
    Array<{
      organizationId: string;
      name: string;
      memberCount: number;
      crm: EntStatus;
      gabinet: EntStatus;
    }>
  > => {
    await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {});
    const db = createSupabaseDb();
    const orgs = await db.query("organizations").collect();
    const memberships = await db.query("teamMemberships").collect();
    const ents = await ctx.runQuery(
      internal.admin.entitlements._listEntitlementsInternal,
      {},
    );

    const statusFor = (orgId: string, productId: string): EntStatus => {
      const e = ents.find(
        (x) => x.organizationId === orgId && x.productId === productId,
      );
      if (!e) return "none";
      return e.status === "active" || e.status === "trialing" ? "active" : "canceled";
    };

    return orgs
      .map((o) => {
        const orgId = String(o._id);
        return {
          organizationId: orgId,
          name: (o.name as string) ?? "(no name)",
          memberCount: memberships.filter(
            (m) => String(m.organizationId) === orgId,
          ).length,
          crm: statusFor(orgId, "crm"),
          gabinet: statusFor(orgId, "gabinet"),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
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
