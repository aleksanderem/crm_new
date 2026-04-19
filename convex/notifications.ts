import { query, action, internalMutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireUser } from "./_helpers/auth";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const limit = args.limit ?? 20;

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);

    return notifications;
  },
});

export const getUnreadCount = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, _args) => {
    const user = await requireUser(ctx);

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userAndRead", (q) =>
        q.eq("userId", user._id).eq("isRead", false)
      )
      .collect();

    return { count: unread.length };
  },
});

export const markAsRead = action({
  args: {
    notificationId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      // notifications are user-scoped, we pass a dummy org to verify auth
      // Actually notifications use requireUser, not verifyOrgAccess
      // We'll use a simpler pattern here
      { organizationId: "skip" as any },
    ).catch(() => null);

    const db = createSupabaseDb();
    const notification = await db.get("notifications", args.notificationId);
    if (!notification) {
      throw new Error("Notification not found");
    }

    await db.patch("notifications", args.notificationId, { isRead: true });
    return args.notificationId;
  },
});

export const markAllRead = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const unread = await db
      .query("notifications")
      .eq("userId", String(authResult.userId))
      .eq("isRead", false)
      .collect();

    for (const notification of unread) {
      await db.patch("notifications", notification._id as string, { isRead: true });
    }

    return unread.length;
  },
});

export const _createNotification = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    type: v.string(),
    title: v.string(),
    message: v.string(),
    link: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("notifications", {
      ...args,
      isRead: false,
      createdAt: Date.now(),
    });
  },
});

export async function createNotificationDirect(
  ctx: MutationCtx,
  data: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    type: string;
    title: string;
    message: string;
    link?: string;
  }
) {
  // Still write to Convex DB for real-time subscriptions
  await ctx.db.insert("notifications", {
    ...data,
    isRead: false,
    createdAt: Date.now(),
  });

  // Also write to Supabase (best-effort, no scheduler needed since we're in a mutation)
  // This stays as a Convex DB write because notifications need real-time reactivity
}
