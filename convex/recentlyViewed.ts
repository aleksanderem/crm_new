import { query, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

export const track = action({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
    entityLabel: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const now = Date.now();

    // Check for existing record (same user + type + entityId)
    const allForType = await db
      .query("recentlyViewed")
      .eq("organizationId", String(args.organizationId))
      .eq("userId", String(authResult.userId))
      .eq("entityType", args.entityType)
      .collect();

    const existing = allForType.find((r: any) => r.entityId === args.entityId);

    if (existing) {
      await db.patch("recentlyViewed", existing._id as string, {
        viewedAt: now,
        entityLabel: args.entityLabel,
      });
    } else {
      await db.insert("recentlyViewed", {
        organizationId: String(args.organizationId),
        userId: String(authResult.userId),
        entityType: args.entityType,
        entityId: args.entityId,
        entityLabel: args.entityLabel,
        viewedAt: now,
      });

      // Re-fetch for eviction check
      const allItems = await db
        .query("recentlyViewed")
        .eq("organizationId", String(args.organizationId))
        .eq("userId", String(authResult.userId))
        .eq("entityType", args.entityType)
        .collect();

      if (allItems.length > 50) {
        allItems.sort((a: any, b: any) => (a.viewedAt ?? 0) - (b.viewedAt ?? 0));
        const toDelete = allItems.slice(0, allItems.length - 50);
        for (const item of toDelete) {
          await db.delete("recentlyViewed", item._id as string);
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
