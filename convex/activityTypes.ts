import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess, requireOrgAdmin } from "./_helpers/auth";

export const DEFAULT_ACTIVITY_TYPES = [
  { key: "call", name: "Połączenie", icon: "phone", color: "#3b82f6" },
  { key: "meeting", name: "Spotkanie", icon: "clock", color: "#a855f7" },
  { key: "email", name: "E-mail", icon: "mail", color: "#22c55e" },
  { key: "task", name: "Zadanie", icon: "check-circle", color: "#f97316" },
];

export const list = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("activityTypeDefinitions")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const seedDefaults = mutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const existing = await ctx.db
      .query("activityTypeDefinitions")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .first();
    if (existing) return;

    const now = Date.now();
    for (let i = 0; i < DEFAULT_ACTIVITY_TYPES.length; i++) {
      const def = DEFAULT_ACTIVITY_TYPES[i];
      await ctx.db.insert("activityTypeDefinitions", {
        organizationId: args.organizationId,
        key: def.key,
        name: def.name,
        icon: def.icon,
        color: def.color,
        isSystem: true,
        order: i,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    key: v.string(),
    name: v.string(),
    icon: v.string(),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const existing = await ctx.db
      .query("activityTypeDefinitions")
      .withIndex("by_orgAndKey", (q) =>
        q.eq("organizationId", args.organizationId).eq("key", args.key)
      )
      .unique();
    if (existing) throw new Error(`Activity type key "${args.key}" already exists`);

    const all = await ctx.db
      .query("activityTypeDefinitions")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const maxOrder = all.length > 0 ? Math.max(...all.map((a) => a.order)) + 1 : 0;

    const now = Date.now();
    return await ctx.db.insert("activityTypeDefinitions", {
      organizationId: args.organizationId,
      key: args.key,
      name: args.name,
      icon: args.icon,
      color: args.color,
      isSystem: false,
      order: maxOrder,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    activityTypeId: v.id("activityTypeDefinitions"),
    name: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const def = await ctx.db.get(args.activityTypeId);
    if (!def || def.organizationId !== args.organizationId) {
      throw new Error("Activity type not found");
    }

    const { organizationId, activityTypeId, ...updates } = args;
    await ctx.db.patch(activityTypeId, { ...updates, updatedAt: Date.now() });
    return activityTypeId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    activityTypeId: v.id("activityTypeDefinitions"),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const def = await ctx.db.get(args.activityTypeId);
    if (!def || def.organizationId !== args.organizationId) {
      throw new Error("Activity type not found");
    }
    if (def.isSystem) {
      throw new Error("Cannot delete system activity types");
    }

    await ctx.db.delete(args.activityTypeId);
    return args.activityTypeId;
  },
});

export const reorder = mutation({
  args: {
    organizationId: v.id("organizations"),
    activityTypeIds: v.array(v.id("activityTypeDefinitions")),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();

    for (let i = 0; i < args.activityTypeIds.length; i++) {
      const def = await ctx.db.get(args.activityTypeIds[i]);
      if (!def || def.organizationId !== args.organizationId) {
        throw new Error("Activity type not found");
      }
      await ctx.db.patch(args.activityTypeIds[i], { order: i, updatedAt: now });
    }
  },
});
