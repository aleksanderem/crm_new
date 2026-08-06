import { query, action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { verifyOrgAccess } from "./_helpers/auth";
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

export const getOrgPermissionOverrides = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { role } = await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    if (role !== "owner" && role !== "admin") throw new Error("Admin access required");

    const db = createSupabaseDb();

    const memberOverride = await db
      .query("orgPermissions")
      .eq("organizationId", String(args.organizationId))
      .eq("role", "member")
      .unique();

    const viewerOverride = await db
      .query("orgPermissions")
      .eq("organizationId", String(args.organizationId))
      .eq("role", "viewer")
      .unique();

    return {
      member: memberOverride?.permissions ?? null,
      viewer: viewerOverride?.permissions ?? null,
    };
  },
});

// Internal mutation that syncs the write to Convex so _helpers/permissions.ts
// (called from QueryCtx/MutationCtx, which cannot reach Supabase) stays
// accurate until those callers are fully migrated to actions.
export const _writeOrgPermissionsToConvex = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    role: v.union(v.literal("member"), v.literal("viewer")),
    permissions: v.any(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
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
        updatedBy: args.userId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("orgPermissions", {
        organizationId: args.organizationId,
        role: args.role,
        permissions: args.permissions,
        updatedBy: args.userId,
        updatedAt: now,
      });
    }

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      action: "permission_changed",
      details: JSON.stringify({ role: args.role, changes: args.permissions }),
    });
  },
});

export const updateOrgPermissions = action({
  args: {
    organizationId: v.id("organizations"),
    role: v.union(v.literal("member"), v.literal("viewer")),
    permissions: v.any(),
  },
  handler: async (ctx, args) => {
    const { userId, role } = await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    if (role !== "owner" && role !== "admin") throw new Error("Admin access required");

    const db = createSupabaseDb();
    const now = Date.now();

    const existing = await db
      .query("orgPermissions")
      .eq("organizationId", String(args.organizationId))
      .eq("role", args.role)
      .unique();

    if (existing) {
      await db.patch("orgPermissions", existing._id as string, {
        permissions: args.permissions,
        updatedBy: String(userId),
        updatedAt: now,
      });
    } else {
      await db.insert("orgPermissions", {
        organizationId: String(args.organizationId),
        role: args.role,
        permissions: args.permissions,
        updatedBy: String(userId),
        updatedAt: now,
      });
    }

    // Dual-write to Convex so _helpers/permissions.ts (used in mutations) stays accurate.
    await ctx.runMutation(internal.permissions._writeOrgPermissionsToConvex, {
      organizationId: args.organizationId,
      role: args.role,
      permissions: args.permissions,
      userId,
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
