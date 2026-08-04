import { v } from "convex/values";
import { query, action, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { verifyOrgAccess } from "./_helpers/auth";

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

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    connectionId: v.string(),
    googleCalendarId: v.string(),
    googleCalendarName: v.string(),
    isOrgDefault: v.optional(v.boolean()),
    targetModule: v.union(v.literal("crm"), v.literal("gabinet")),
    targetActivityType: v.optional(v.string()),
    visibility: v.union(v.literal("full"), v.literal("busy_only"), v.literal("hidden")),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const isOrgDefault = args.isOrgDefault ?? false;

    if (isOrgDefault) {
      // Unset existing org default
      const existing = await db
        .query("googleCalendarSyncConfigs")
        .eq("organizationId", String(args.organizationId))
        .eq("isOrgDefault", true)
        .first();
      if (existing) {
        await db.patch("googleCalendarSyncConfigs", existing._id as string, { isOrgDefault: false });
      }
    }

    const configId = await db.insert("googleCalendarSyncConfigs", {
      organizationId: String(args.organizationId),
      userId: String(authResult.userId),
      connectionId: args.connectionId,
      googleCalendarId: args.googleCalendarId,
      googleCalendarName: args.googleCalendarName,
      isOrgDefault,
      targetModule: args.targetModule,
      targetActivityType: args.targetActivityType ?? null,
      visibility: args.visibility,
      syncEnabled: true,
      syncStatus: "idle",
    });

    return configId;
  },
});

export const update = action({
  args: {
    configId: v.string(),
    targetModule: v.optional(v.union(v.literal("crm"), v.literal("gabinet"))),
    targetActivityType: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal("full"), v.literal("busy_only"), v.literal("hidden"))),
    syncEnabled: v.optional(v.boolean()),
    isOrgDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Records shown by listMine live in Convex (list queries use ctx.db).
    // Look up via Convex using getById, not db.get() which uses Supabase UUIDs.
    const config = await ctx.runQuery(
      internal.googleCalendarSyncConfigs.getById,
      { configId: args.configId as any },
    );
    if (!config) throw new Error("Config not found");

    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: config.organizationId },
    );

    const isOwner = config.userId === authResult.userId;
    const isAdmin = authResult.role === "owner" || authResult.role === "admin";
    if (!isOwner && !isAdmin) {
      throw new Error("You can only modify your own calendar configs");
    }
    if (args.visibility !== undefined && !isOwner) {
      throw new Error("Only the calendar owner can change visibility settings");
    }

    await ctx.runMutation(
      internal.googleCalendarSyncConfigs.updateConfig,
      {
        configId: args.configId as any,
        organizationId: config.organizationId,
        targetModule: args.targetModule,
        targetActivityType: args.targetActivityType,
        visibility: args.visibility,
        syncEnabled: args.syncEnabled,
        isOrgDefault: args.isOrgDefault,
      },
    );
  },
});

export const remove = action({
  args: { configId: v.string() },
  handler: async (ctx, args) => {
    // Records shown by listMine live in Convex (list queries use ctx.db).
    // The migration moved create/update/remove to Supabase-primary but did not
    // migrate the list queries, so existing records are Convex-only and their
    // _id values are Convex IDs — not Supabase UUIDs. Look up via Convex.
    const config = await ctx.runQuery(
      internal.googleCalendarSyncConfigs.getById,
      { configId: args.configId as any },
    );
    if (!config) throw new Error("Config not found");

    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: config.organizationId },
    );

    const isOwner = config.userId === authResult.userId;
    const isAdmin = authResult.role === "owner" || authResult.role === "admin";
    if (!isOwner && !isAdmin) {
      throw new Error("You can only remove your own calendar configs");
    }

    await ctx.runMutation(
      internal.googleCalendarSyncConfigs.deleteConfig,
      { configId: args.configId as any },
    );
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

export const deleteConfig = internalMutation({
  args: { configId: v.id("googleCalendarSyncConfigs") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.configId);
  },
});

export const updateConfig = internalMutation({
  args: {
    configId: v.id("googleCalendarSyncConfigs"),
    organizationId: v.id("organizations"),
    targetModule: v.optional(v.union(v.literal("crm"), v.literal("gabinet"))),
    targetActivityType: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal("full"), v.literal("busy_only"), v.literal("hidden"))),
    syncEnabled: v.optional(v.boolean()),
    isOrgDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.isOrgDefault === true) {
      const existing = await ctx.db
        .query("googleCalendarSyncConfigs")
        .withIndex("by_orgDefault", (q) =>
          q.eq("organizationId", args.organizationId).eq("isOrgDefault", true)
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
