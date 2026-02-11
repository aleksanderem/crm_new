import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

export const listByEntityType = query({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const views = await ctx.db
      .query("savedViews")
      .withIndex("by_orgAndEntityType", (q) =>
        q.eq("organizationId", args.organizationId).eq("entityType", args.entityType)
      )
      .collect();

    views.sort((a, b) => a.order - b.order);
    return views;
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    viewId: v.id("savedViews"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const view = await ctx.db.get(args.viewId);
    if (!view || view.organizationId !== args.organizationId) {
      throw new Error("Saved view not found");
    }

    return view;
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    name: v.string(),
    filters: v.any(),
    columns: v.optional(v.array(v.string())),
    sortField: v.optional(v.string()),
    sortDirection: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    isSystem: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    // Enforce max 5 custom (non-system) views per entity per org
    if (!args.isSystem) {
      const existing = await ctx.db
        .query("savedViews")
        .withIndex("by_orgAndEntityType", (q) =>
          q.eq("organizationId", args.organizationId).eq("entityType", args.entityType)
        )
        .collect();

      const customViews = existing.filter((v) => !v.isSystem);
      if (customViews.length >= 5) {
        throw new Error("Maximum of 5 custom views per entity type reached");
      }
    }

    // Calculate order (append at end)
    const existing = await ctx.db
      .query("savedViews")
      .withIndex("by_orgAndEntityType", (q) =>
        q.eq("organizationId", args.organizationId).eq("entityType", args.entityType)
      )
      .collect();
    const maxOrder = existing.length > 0 ? Math.max(...existing.map((v) => v.order)) : -1;

    const viewId = await ctx.db.insert("savedViews", {
      ...args,
      createdBy: user._id,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });

    return viewId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    viewId: v.id("savedViews"),
    name: v.optional(v.string()),
    filters: v.optional(v.any()),
    columns: v.optional(v.array(v.string())),
    sortField: v.optional(v.string()),
    sortDirection: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const view = await ctx.db.get(args.viewId);
    if (!view || view.organizationId !== args.organizationId) {
      throw new Error("Saved view not found");
    }

    const { organizationId, viewId, ...updates } = args;
    await ctx.db.patch(viewId, { ...updates, updatedAt: Date.now() });

    return viewId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    viewId: v.id("savedViews"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const view = await ctx.db.get(args.viewId);
    if (!view || view.organizationId !== args.organizationId) {
      throw new Error("Saved view not found");
    }

    await ctx.db.delete(args.viewId);
    return args.viewId;
  },
});

export const reorder = mutation({
  args: {
    organizationId: v.id("organizations"),
    viewIds: v.array(v.id("savedViews")),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    for (let i = 0; i < args.viewIds.length; i++) {
      const view = await ctx.db.get(args.viewIds[i]);
      if (!view || view.organizationId !== args.organizationId) {
        throw new Error("Saved view not found");
      }
      await ctx.db.patch(args.viewIds[i], { order: i, updatedAt: Date.now() });
    }

    return true;
  },
});
