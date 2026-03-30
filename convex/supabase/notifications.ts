/**
 * Convex → Supabase Notification Dual-Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeNotificationToSupabase = internalAction({
  args: {
    notificationId: v.string(),
    organizationId: v.string(),
    userId: v.string(),
    type: v.string(),
    title: v.string(),
    message: v.string(),
    link: v.optional(v.string()),
    isRead: v.boolean(),
    createdAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();
    const row = {
      id: args.notificationId,
      organization_id: args.organizationId,
      user_id: args.userId,
      type: args.type,
      title: args.title,
      message: args.message,
      link: args.link ?? null,
      is_read: args.isRead,
      created_at: args.createdAt,
    };

    const { data, error } = await client
      .from("notifications")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for notification: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Notification written to Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});

export const updateNotificationInSupabase = internalAction({
  args: {
    notificationId: v.string(),
    isRead: v.optional(v.boolean()),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();
    const row: Record<string, unknown> = {};
    if (args.isRead !== undefined) row.is_read = args.isRead;

    const { data, error } = await client
      .from("notifications")
      .update(row)
      .eq("id", args.notificationId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for notification ${args.notificationId}: ${error.message}`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Notification updated in Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});

export const markAllNotificationsReadInSupabase = internalAction({
  args: {
    organizationId: v.string(),
    userId: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("notifications")
      .update({ is_read: true })
      .eq("organization_id", args.organizationId)
      .eq("user_id", args.userId)
      .eq("is_read", false);

    if (error) {
      const msg = `Supabase markAllRead failed: ${error.message}`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`All notifications marked read in Supabase for user=${args.userId}`);
    return { success: true };
  },
});
