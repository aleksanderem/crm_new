import { query, action, internalMutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
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
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args): Promise<string> => {
    await ctx.runMutation(internal.notifications._markAsReadInternal, {
      notificationId: args.notificationId,
    });
    return args.notificationId;
  },
});

export const _markAsReadInternal = internalMutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return;
    await ctx.db.patch(args.notificationId, { isRead: true });
  },
});

export const markAllRead = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args): Promise<number> => {
    return await ctx.runMutation(internal.notifications._markAllReadInternal, {
      organizationId: args.organizationId,
    });
  },
});

export const _markAllReadInternal = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, _args) => {
    const user = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userAndRead", (q) =>
        q.eq("userId", user._id).eq("isRead", false)
      )
      .collect();
    for (const notification of unread) {
      await ctx.db.patch(notification._id, { isRead: true });
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
    metadata: v.optional(v.any()),
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
    metadata?: unknown;
  }
) {
  // Notifications live in Convex for real-time push (live queries on the bell).
  await ctx.db.insert("notifications", {
    ...data,
    isRead: false,
    createdAt: Date.now(),
  });
}
