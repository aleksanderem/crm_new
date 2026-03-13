import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

export const track = mutation({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
    entityLabel: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    // Check for existing record (same user + type + entityId)
    const existing = await ctx.db
      .query("recentlyViewed")
      .withIndex("by_user_type", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("userId", user._id)
          .eq("entityType", args.entityType)
      )
      .collect()
      .then((rows) => rows.find((r) => r.entityId === args.entityId));

    if (existing) {
      await ctx.db.patch(existing._id, {
        viewedAt: now,
        entityLabel: args.entityLabel,
      });
    } else {
      await ctx.db.insert("recentlyViewed", {
        organizationId: args.organizationId,
        userId: user._id,
        entityType: args.entityType,
        entityId: args.entityId,
        entityLabel: args.entityLabel,
        viewedAt: now,
      });

      // Eviction: keep max 50 items per user+type, delete oldest
      const allItems = await ctx.db
        .query("recentlyViewed")
        .withIndex("by_user_type", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("userId", user._id)
            .eq("entityType", args.entityType)
        )
        .collect();

      if (allItems.length > 50) {
        allItems.sort((a, b) => a.viewedAt - b.viewedAt);
        const toDelete = allItems.slice(0, allItems.length - 50);
        for (const item of toDelete) {
          await ctx.db.delete(item._id);
        }
      }
    }
  },
});

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const limit = args.limit ?? 3;

    const items = await ctx.db
      .query("recentlyViewed")
      .withIndex("by_user_type", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("userId", user._id)
          .eq("entityType", args.entityType)
      )
      .order("desc")
      .take(limit);

    return items.map((item) => ({
      entityId: item.entityId,
      entityLabel: item.entityLabel,
      viewedAt: item.viewedAt,
    }));
  },
});
