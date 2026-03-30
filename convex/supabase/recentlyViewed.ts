/**
 * Convex → Supabase RecentlyViewed Dual-Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeRecentlyViewedToSupabase = internalAction({
  args: {
    recentlyViewedId: v.string(),
    organizationId: v.string(),
    userId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    entityLabel: v.string(),
    viewedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();
    const row = {
      id: args.recentlyViewedId,
      organization_id: args.organizationId,
      user_id: args.userId,
      entity_type: args.entityType,
      entity_id: args.entityId,
      entity_label: args.entityLabel,
      viewed_at: args.viewedAt,
    };

    const { data, error } = await client
      .from("recently_viewed")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for recentlyViewed: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`RecentlyViewed written to Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});

export const deleteRecentlyViewedFromSupabase = internalAction({
  args: {
    recentlyViewedId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("recently_viewed")
      .delete()
      .eq("id", args.recentlyViewedId);

    if (error) {
      const msg = `Supabase delete failed for recentlyViewed ${args.recentlyViewedId}: ${error.message}`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`RecentlyViewed deleted from Supabase id=${args.recentlyViewedId}`);
    return { success: true, id: args.recentlyViewedId };
  },
});
