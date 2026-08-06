import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";

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
    const authResult = await ctx.runAction(
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
    const db = createSupabaseDb();
    const config = await db.get("googleCalendarSyncConfigs", args.configId);
    if (!config) throw new Error("Config not found");

    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: config.organizationId as any },
    );

    const isOwner = config.userId === String(authResult.userId);
    const isAdmin = authResult.role === "owner" || authResult.role === "admin";
    if (!isOwner && !isAdmin) throw new Error("You can only modify your own calendar configs");
    if (args.visibility !== undefined && !isOwner) throw new Error("Only the calendar owner can change visibility settings");

    if (args.isOrgDefault === true) {
      const existing = await db
        .query("googleCalendarSyncConfigs")
        .eq("organizationId", config.organizationId as string)
        .eq("isOrgDefault", true)
        .first();
      if (existing && existing._id !== args.configId) {
        await db.patch("googleCalendarSyncConfigs", existing._id as string, { isOrgDefault: false });
      }
    }

    const patch: Record<string, unknown> = {};
    if (args.targetModule !== undefined) patch.targetModule = args.targetModule;
    if (args.targetActivityType !== undefined) patch.targetActivityType = args.targetActivityType;
    if (args.visibility !== undefined) patch.visibility = args.visibility;
    if (args.syncEnabled !== undefined) patch.syncEnabled = args.syncEnabled;
    if (args.isOrgDefault !== undefined) patch.isOrgDefault = args.isOrgDefault;
    await db.patch("googleCalendarSyncConfigs", args.configId, patch);
  },
});

export const remove = action({
  args: { configId: v.string() },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const config = await db.get("googleCalendarSyncConfigs", args.configId);
    if (!config) throw new Error("Config not found");

    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: config.organizationId as any },
    );

    const isOwner = config.userId === String(authResult.userId);
    const isAdmin = authResult.role === "owner" || authResult.role === "admin";
    if (!isOwner && !isAdmin) throw new Error("You can only remove your own calendar configs");

    await db.delete("googleCalendarSyncConfigs", args.configId);
  },
});

