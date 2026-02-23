import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const reasons = await ctx.db
      .query("lostReasons")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    reasons.sort((a, b) => a.order - b.order);
    return reasons;
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const existing = await ctx.db
      .query("lostReasons")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const maxOrder = existing.length > 0 ? Math.max(...existing.map((r) => r.order)) : -1;

    const reasonId = await ctx.db.insert("lostReasons", {
      organizationId: args.organizationId,
      label: args.label,
      order: maxOrder + 1,
      isActive: true,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return reasonId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    reasonId: v.id("lostReasons"),
    label: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const reason = await ctx.db.get(args.reasonId);
    if (!reason || reason.organizationId !== args.organizationId) {
      throw new Error("Lost reason not found");
    }

    const { organizationId, reasonId, ...updates } = args;
    await ctx.db.patch(reasonId, { ...updates, updatedAt: Date.now() });

    return reasonId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    reasonId: v.id("lostReasons"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const reason = await ctx.db.get(args.reasonId);
    if (!reason || reason.organizationId !== args.organizationId) {
      throw new Error("Lost reason not found");
    }

    await ctx.db.delete(args.reasonId);
    return args.reasonId;
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
      .query("lostReasons")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    if (existing.length > 0) return [];

    const defaults = [
      "Budget constraints",
      "Chose competitor",
      "No response",
      "Timing not right",
      "Requirements changed",
      "Price too high",
      "Other",
    ];
    const ids = [];

    for (let i = 0; i < defaults.length; i++) {
      const id = await ctx.db.insert("lostReasons", {
        organizationId: args.organizationId,
        label: defaults[i],
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

export const reorder = mutation({
  args: {
    organizationId: v.id("organizations"),
    reasonIds: v.array(v.id("lostReasons")),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    for (let i = 0; i < args.reasonIds.length; i++) {
      const reason = await ctx.db.get(args.reasonIds[i]);
      if (!reason || reason.organizationId !== args.organizationId) {
        throw new Error("Lost reason not found");
      }
      await ctx.db.patch(args.reasonIds[i], { order: i, updatedAt: Date.now() });
    }

    return true;
  },
});
