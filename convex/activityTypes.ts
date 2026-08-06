import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";

export const DEFAULT_ACTIVITY_TYPES = [
  { key: "call", name: "Połączenie", icon: "phone", color: "#3b82f6" },
  { key: "meeting", name: "Spotkanie", icon: "clock", color: "#a855f7" },
  { key: "email", name: "E-mail", icon: "mail", color: "#22c55e" },
  { key: "task", name: "Zadanie", icon: "check-circle", color: "#f97316" },
];

export const list = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args): Promise<Array<Record<string, unknown>>> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    return (await db
      .query("activityTypeDefinitions")
      .eq("organizationId", String(args.organizationId))
      .collect()) as Array<Record<string, unknown>>;
  },
});

export const seedDefaults = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const existing = await db
      .query("activityTypeDefinitions")
      .eq("organizationId", String(args.organizationId))
      .first();
    if (existing) return;

    const now = Date.now();
    for (let i = 0; i < DEFAULT_ACTIVITY_TYPES.length; i++) {
      const def = DEFAULT_ACTIVITY_TYPES[i];
      await db.insert("activityTypeDefinitions", {
        organizationId: String(args.organizationId),
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

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    key: v.string(),
    name: v.string(),
    icon: v.string(),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();

    // Check for duplicate key
    const existing = await db
      .query("activityTypeDefinitions")
      .eq("organizationId", String(args.organizationId))
      .eq("key", args.key)
      .first();
    if (existing) throw new Error(`Activity type key "${args.key}" already exists`);

    const all = await db
      .query("activityTypeDefinitions")
      .eq("organizationId", String(args.organizationId))
      .collect();
    const maxOrder = all.length > 0 ? Math.max(...all.map((a: any) => a.order ?? 0)) + 1 : 0;

    const now = Date.now();
    const actTypeId = await db.insert("activityTypeDefinitions", {
      organizationId: String(args.organizationId),
      key: args.key,
      name: args.name,
      icon: args.icon,
      color: args.color ?? null,
      isSystem: false,
      order: maxOrder,
      createdAt: now,
      updatedAt: now,
    });

    return actTypeId;
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    activityTypeId: v.string(),
    name: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const def = await db.get("activityTypeDefinitions", args.activityTypeId);
    if (!def || def.organizationId !== String(args.organizationId)) {
      throw new Error("Activity type not found");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.icon !== undefined) updates.icon = args.icon;
    if (args.color !== undefined) updates.color = args.color;

    await db.patch("activityTypeDefinitions", args.activityTypeId, updates);
    return args.activityTypeId;
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    activityTypeId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const def = await db.get("activityTypeDefinitions", args.activityTypeId);
    if (!def || def.organizationId !== String(args.organizationId)) {
      throw new Error("Activity type not found");
    }
    if (def.isSystem) {
      throw new Error("Cannot delete system activity types");
    }

    await db.delete("activityTypeDefinitions", args.activityTypeId);
    return args.activityTypeId;
  },
});

export const reorder = action({
  args: {
    organizationId: v.id("organizations"),
    activityTypeIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const now = Date.now();

    for (let i = 0; i < args.activityTypeIds.length; i++) {
      const def = await db.get("activityTypeDefinitions", args.activityTypeIds[i]);
      if (!def || def.organizationId !== String(args.organizationId)) {
        throw new Error("Activity type not found");
      }
      await db.patch("activityTypeDefinitions", args.activityTypeIds[i], { order: i, updatedAt: now });
    }
  },
});
