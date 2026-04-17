import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyOrgAccess } from "./_helpers/auth";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeGcSyncConfigRef = internal.supabase.googleCalendarSyncConfigs.writeGoogleCalendarSyncConfigToSupabase;

// List all sync configs for the current user in an org
export const listMine = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("googleCalendarSyncConfigs")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", user._id)
      )
      .collect();
  },
});

// List all sync configs in an org (admin view only)
export const listAll = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { membership } = await verifyOrgAccess(ctx, args.organizationId);
    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new Error("Only admins can view all calendar configs");
    }
    return await ctx.db
      .query("googleCalendarSyncConfigs")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
  },
});

// Get org default calendar config
export const getOrgDefault = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("googleCalendarSyncConfigs")
      .withIndex("by_orgDefault", (q) =>
        q.eq("organizationId", args.organizationId).eq("isOrgDefault", true)
      )
      .first();
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    connectionId: v.id("oauthConnections"),
    googleCalendarId: v.string(),
    googleCalendarName: v.string(),
    isOrgDefault: v.optional(v.boolean()),
    targetModule: v.union(v.literal("crm"), v.literal("gabinet")),
    targetActivityType: v.optional(v.string()),
    visibility: v.union(v.literal("full"), v.literal("busy_only"), v.literal("hidden")),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const isOrgDefault = args.isOrgDefault ?? false;

    if (isOrgDefault) {
      const existing = await ctx.db
        .query("googleCalendarSyncConfigs")
        .withIndex("by_orgDefault", (q) =>
          q.eq("organizationId", args.organizationId).eq("isOrgDefault", true)
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { isOrgDefault: false });
      }
    }

    const configId = await ctx.db.insert("googleCalendarSyncConfigs", {
      organizationId: args.organizationId,
      userId: user._id,
      connectionId: args.connectionId,
      googleCalendarId: args.googleCalendarId,
      googleCalendarName: args.googleCalendarName,
      isOrgDefault,
      targetModule: args.targetModule,
      targetActivityType: args.targetActivityType,
      visibility: args.visibility,
      syncEnabled: true,
      syncStatus: "idle",
    });

    // Dual-write: replicate to Supabase
    await ctx.scheduler.runAfter(0, writeGcSyncConfigRef, {
      configId: configId as string,
      organizationId: args.organizationId as string,
      userId: user._id as string,
      connectionId: args.connectionId as string,
      googleCalendarId: args.googleCalendarId,
      googleCalendarName: args.googleCalendarName,
      isOrgDefault,
      targetModule: args.targetModule,
      targetActivityType: args.targetActivityType,
      visibility: args.visibility,
      syncEnabled: true,
      syncStatus: "idle",
    });

    return configId;
  },
});

export const update = mutation({
  args: {
    configId: v.id("googleCalendarSyncConfigs"),
    targetModule: v.optional(v.union(v.literal("crm"), v.literal("gabinet"))),
    targetActivityType: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal("full"), v.literal("busy_only"), v.literal("hidden"))),
    syncEnabled: v.optional(v.boolean()),
    isOrgDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.configId);
    if (!config) throw new Error("Config not found");
    const { user, membership } = await verifyOrgAccess(ctx, config.organizationId);
    const isOwner = config.userId === user._id;
    const isAdmin = membership.role === "owner" || membership.role === "admin";
    if (!isOwner && !isAdmin) {
      throw new Error("You can only modify your own calendar configs");
    }
    // Only the config owner can change their visibility (privacy control)
    if (args.visibility !== undefined && !isOwner) {
      throw new Error("Only the calendar owner can change visibility settings");
    }

    if (args.isOrgDefault === true) {
      const existing = await ctx.db
        .query("googleCalendarSyncConfigs")
        .withIndex("by_orgDefault", (q) =>
          q.eq("organizationId", config.organizationId).eq("isOrgDefault", true)
        )
        .first();
      if (existing && existing._id !== args.configId) {
        await ctx.db.patch(existing._id, { isOrgDefault: false });
      }
    }

    const patch: Record<string, unknown> = {};
    if (args.targetModule !== undefined) patch.targetModule = args.targetModule;
    if (args.targetActivityType !== undefined) patch.targetActivityType = args.targetActivityType;
    if (args.visibility !== undefined) patch.visibility = args.visibility;
    if (args.syncEnabled !== undefined) patch.syncEnabled = args.syncEnabled;
    if (args.isOrgDefault !== undefined) patch.isOrgDefault = args.isOrgDefault;

    await ctx.db.patch(args.configId, patch);
  },
});

export const remove = mutation({
  args: { configId: v.id("googleCalendarSyncConfigs") },
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.configId);
    if (!config) throw new Error("Config not found");
    const { user, membership } = await verifyOrgAccess(ctx, config.organizationId);
    const isOwner = config.userId === user._id;
    const isAdmin = membership.role === "owner" || membership.role === "admin";
    if (!isOwner && !isAdmin) {
      throw new Error("You can only remove your own calendar configs");
    }
    await ctx.db.delete(args.configId);
  },
});

// --- Internal queries/mutations for sync pipeline ---

export const getEnabledConfigs = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleCalendarSyncConfigs")
      .withIndex("by_syncEnabled", (q) => q.eq("syncEnabled", true))
      .order("asc")
      .take(args.limit);
  },
});

export const getById = internalQuery({
  args: { configId: v.id("googleCalendarSyncConfigs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.configId);
  },
});

export const getByOrgAndUser = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleCalendarSyncConfigs")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .collect();
  },
});

export const updateSyncState = internalMutation({
  args: {
    configId: v.id("googleCalendarSyncConfigs"),
    syncStatus: v.optional(v.union(v.literal("idle"), v.literal("syncing"), v.literal("error"))),
    syncError: v.optional(v.string()),
    lastSyncToken: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { configId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    if (updates.syncStatus !== undefined) patch.syncStatus = updates.syncStatus;
    if (updates.syncError !== undefined) {
      patch.syncError = updates.syncError;
    } else if (updates.syncStatus === "idle") {
      // Clear error when transitioning to idle (successful sync)
      patch.syncError = undefined;
    }
    if (updates.lastSyncToken !== undefined) patch.lastSyncToken = updates.lastSyncToken;
    if (updates.lastSyncAt !== undefined) patch.lastSyncAt = updates.lastSyncAt;
    await ctx.db.patch(configId, patch);
  },
});

export const resetSyncToken = internalMutation({
  args: { configId: v.id("googleCalendarSyncConfigs") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.configId, {
      lastSyncToken: undefined,
      syncStatus: "idle",
    });
  },
});
