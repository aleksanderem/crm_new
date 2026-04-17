import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { verifyOrgAccess, requireOrgAdmin } from "./_helpers/auth";
import { getEffectivePermissions } from "./_helpers/permissions";
import { logAudit } from "./auditLog";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeOrgSettingsRef = internal.supabase.orgSettings.writeOrgSettingsToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeOrgPermissionRef = internal.supabase.orgPermissions.writeOrgPermissionToSupabase;

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

    let permId: string;
    if (existing) {
      await ctx.db.patch(existing._id, {
        permissions: args.permissions,
        updatedBy: user._id,
        updatedAt: now,
      });
      permId = existing._id as string;
    } else {
      const newId = await ctx.db.insert("orgPermissions", {
        organizationId: args.organizationId,
        role: args.role,
        permissions: args.permissions,
        updatedBy: user._id,
        updatedAt: now,
      });
      permId = newId as string;
    }

    // Dual-write: replicate to Supabase
    await ctx.scheduler.runAfter(0, writeOrgPermissionRef, {
      orgPermissionId: permId,
      organizationId: args.organizationId as string,
      role: args.role,
      permissions: JSON.stringify(args.permissions),
      updatedBy: user._id as string,
      updatedAt: now,
    });

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: user._id,
      action: "permission_changed",
      details: JSON.stringify({ role: args.role, changes: args.permissions }),
    });
  },
});

export const getResourceSharingEnabled = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const settings = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    return settings?.resourceSharingEnabled ?? true;
  },
});

export const setResourceSharingEnabled = mutation({
  args: {
    organizationId: v.id("organizations"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();

    const settings = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    if (settings) {
      await ctx.db.patch(settings._id, {
        resourceSharingEnabled: args.enabled,
        updatedAt: now,
      });
      // Dual-write: upsert updated settings to Supabase
      await ctx.scheduler.runAfter(0, writeOrgSettingsRef, {
        orgSettingsId: settings._id as any,
        organizationId: args.organizationId as any,
        allowCustomLostReason: settings.allowCustomLostReason,
        lostReasonRequired: settings.lostReasonRequired,
        resourceSharingEnabled: args.enabled,
        createdAt: settings.createdAt,
        updatedAt: now,
      });
    } else {
      const settingsId = await ctx.db.insert("orgSettings", {
        organizationId: args.organizationId,
        allowCustomLostReason: false,
        lostReasonRequired: false,
        resourceSharingEnabled: args.enabled,
        createdAt: now,
        updatedAt: now,
      });
      // Dual-write: insert new settings to Supabase
      await ctx.scheduler.runAfter(0, writeOrgSettingsRef, {
        orgSettingsId: settingsId as any,
        organizationId: args.organizationId as any,
        allowCustomLostReason: false,
        lostReasonRequired: false,
        resourceSharingEnabled: args.enabled,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
