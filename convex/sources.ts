import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";

export const list = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const sources = await db
      .query<{ order?: number }>("sources")
      .eq("organizationId", String(args.organizationId))
      .collect();

    sources.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return sources;
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const now = Date.now();

    const existing = await db
      .query("sources")
      .eq("organizationId", String(args.organizationId))
      .collect();
    const maxOrder = existing.length > 0 ? Math.max(...existing.map((s: any) => s.order ?? 0)) : -1;

    const sourceId = await db.insert("sources", {
      organizationId: String(args.organizationId),
      name: args.name,
      order: maxOrder + 1,
      isActive: true,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    return sourceId;
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    sourceId: v.string(),
    name: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const source = await db.get("sources", args.sourceId);
    if (!source || source.organizationId !== String(args.organizationId)) {
      throw new Error("Source not found");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await db.patch("sources", args.sourceId, updates);
    return args.sourceId;
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    sourceId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const source = await db.get("sources", args.sourceId);
    if (!source || source.organizationId !== String(args.organizationId)) {
      throw new Error("Source not found");
    }

    await db.delete("sources", args.sourceId);
    return args.sourceId;
  },
});

export const reorder = action({
  args: {
    organizationId: v.id("organizations"),
    sourceIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();

    for (let i = 0; i < args.sourceIds.length; i++) {
      const source = await db.get("sources", args.sourceIds[i]);
      if (!source || source.organizationId !== String(args.organizationId)) {
        throw new Error("Source not found");
      }
      await db.patch("sources", args.sourceIds[i], { order: i, updatedAt: Date.now() });
    }

    return true;
  },
});

export const seed = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const now = Date.now();

    const existing = await db
      .query("sources")
      .eq("organizationId", String(args.organizationId))
      .collect();

    if (existing.length > 0) {
      return [];
    }

    const defaults = ["Website", "Referral", "Cold Call", "Social Media", "Email Campaign", "Trade Show", "Other"];
    const ids = [];

    for (let i = 0; i < defaults.length; i++) {
      const id = await db.insert("sources", {
        organizationId: String(args.organizationId),
        name: defaults[i],
        order: i,
        isActive: true,
        createdBy: String(authResult.userId),
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }

    return ids;
  },
});
