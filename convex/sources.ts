import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const sources = await ctx.db
      .query("sources")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    sources.sort((a, b) => a.order - b.order);
    return sources;
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const existing = await ctx.db
      .query("sources")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const maxOrder = existing.length > 0 ? Math.max(...existing.map((s) => s.order)) : -1;

    const sourceId = await ctx.db.insert("sources", {
      organizationId: args.organizationId,
      name: args.name,
      order: maxOrder + 1,
      isActive: true,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return sourceId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    sourceId: v.id("sources"),
    name: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const source = await ctx.db.get(args.sourceId);
    if (!source || source.organizationId !== args.organizationId) {
      throw new Error("Source not found");
    }

    const { organizationId, sourceId, ...updates } = args;
    await ctx.db.patch(sourceId, { ...updates, updatedAt: Date.now() });

    return sourceId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    sourceId: v.id("sources"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const source = await ctx.db.get(args.sourceId);
    if (!source || source.organizationId !== args.organizationId) {
      throw new Error("Source not found");
    }

    await ctx.db.delete(args.sourceId);
    return args.sourceId;
  },
});

export const reorder = mutation({
  args: {
    organizationId: v.id("organizations"),
    sourceIds: v.array(v.id("sources")),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    for (let i = 0; i < args.sourceIds.length; i++) {
      const source = await ctx.db.get(args.sourceIds[i]);
      if (!source || source.organizationId !== args.organizationId) {
        throw new Error("Source not found");
      }
      await ctx.db.patch(args.sourceIds[i], { order: i, updatedAt: Date.now() });
    }

    return true;
  },
});

export const seed = mutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const existing = await ctx.db
      .query("sources")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    if (existing.length > 0) {
      return [];
    }

    const defaults = ["Website", "Referral", "Cold Call", "Social Media", "Email Campaign", "Trade Show", "Other"];
    const ids = [];

    for (let i = 0; i < defaults.length; i++) {
      const id = await ctx.db.insert("sources", {
        organizationId: args.organizationId,
        name: defaults[i],
        order: i,
        isActive: true,
        createdBy: user._id,
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }

    return ids;
  },
});
