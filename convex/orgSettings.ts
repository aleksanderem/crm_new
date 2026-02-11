import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

export const get = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const settings = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    return settings;
  },
});

export const upsert = mutation({
  args: {
    organizationId: v.id("organizations"),
    allowCustomLostReason: v.optional(v.boolean()),
    lostReasonRequired: v.optional(v.boolean()),
    defaultCurrency: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const existing = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    if (existing) {
      const { organizationId, ...updates } = args;
      await ctx.db.patch(existing._id, { ...updates, updatedAt: now });
      return existing._id;
    }

    const settingsId = await ctx.db.insert("orgSettings", {
      organizationId: args.organizationId,
      allowCustomLostReason: args.allowCustomLostReason ?? false,
      lostReasonRequired: args.lostReasonRequired ?? false,
      defaultCurrency: args.defaultCurrency,
      createdAt: now,
      updatedAt: now,
    });

    return settingsId;
  },
});
