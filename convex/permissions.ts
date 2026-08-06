import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { verifyOrgAccess, requireOrgAdmin } from "./_helpers/auth";
import { getEffectivePermissions } from "./_helpers/permissions";
import { logAudit } from "./auditLog";

export const getMyPermissions = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await getEffectivePermissions(ctx, args.organizationId);
  },
});

export const getMyRole = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { membership } = await verifyOrgAccess(ctx, args.organizationId);
    return { role: membership.role };
  },
});

export const getMyGabinetRole = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const membership = await ctx.db
      .query("gabinetMemberships")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", user._id)
      )
      .unique();
    if (!membership) return { gabinetRole: null, isActive: null };
    return { gabinetRole: membership.gabinetRole, isActive: membership.isActive };
  },
});

export const getOrgPermissionOverrides = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const memberOverride = await ctx.db
      .query("orgPermissions")
      .withIndex("by_orgAndRole", (q) =>
        q.eq("organizationId", args.organizationId).eq("role", "member")
      )
      .unique();

    const viewerOverride = await ctx.db
      .query("orgPermissions")
      .withIndex("by_orgAndRole", (q) =>
        q.eq("organizationId", args.organizationId).eq("role", "viewer")
      )
      .unique();

    return {
      member: memberOverride?.permissions ?? null,
      viewer: viewerOverride?.permissions ?? null,
    };
  },
});

// orgPermissions is an AUTH table — stays as mutation in Convex DB
export const updateOrgPermissions = mutation({
  args: {
    organizationId: v.id("organizations"),
    role: v.union(v.literal("member"), v.literal("viewer")),
    permissions: v.any(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();

    const existing = await ctx.db
      .query("orgPermissions")
      .withIndex("by_orgAndRole", (q) =>
        q.eq("organizationId", args.organizationId).eq("role", args.role)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        permissions: args.permissions,
        updatedBy: user._id,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("orgPermissions", {
        organizationId: args.organizationId,
        role: args.role,
        permissions: args.permissions,
        updatedBy: user._id,
        updatedAt: now,
      });
    }

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: user._id,
      action: "permission_changed",
      details: JSON.stringify({ role: args.role, changes: args.permissions }),
    });
  },
});

export const getResourceSharingEnabled = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const settings = await db
      .query("orgSettings")
      .eq("organizationId", String(args.organizationId))
      .first();

    return (settings?.resourceSharingEnabled as boolean | undefined) ?? true;
  },
});

export const setResourceSharingEnabled = action({
  args: {
    organizationId: v.id("organizations"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const now = Date.now();

    const existing = await db
      .query("orgSettings")
      .eq("organizationId", String(args.organizationId))
      .first();

    if (existing) {
      await db.patch("orgSettings", existing._id as string, {
        resourceSharingEnabled: args.enabled,
        updatedAt: now,
      });
    } else {
      await db.insert("orgSettings", {
        organizationId: String(args.organizationId),
        allowCustomLostReason: false,
        lostReasonRequired: false,
        resourceSharingEnabled: args.enabled,
        createdAt: now,
        updatedAt: now,
      });
    }

  },
});
