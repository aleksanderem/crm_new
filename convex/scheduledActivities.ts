import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { activityTypeValidator } from "@cvx/schema";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    activityType: v.optional(activityTypeValidator),
    isCompleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    if (args.activityType) {
      return await ctx.db
        .query("scheduledActivities")
        .withIndex("by_orgAndType", (q) =>
          q.eq("organizationId", args.organizationId).eq("activityType", args.activityType!)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    if (args.isCompleted !== undefined) {
      return await ctx.db
        .query("scheduledActivities")
        .withIndex("by_orgAndCompleted", (q) =>
          q.eq("organizationId", args.organizationId).eq("isCompleted", args.isCompleted!)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("scheduledActivities")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.id("scheduledActivities"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const activity = await ctx.db.get(args.activityId);
    if (!activity || activity.organizationId !== args.organizationId) {
      throw new Error("Scheduled activity not found");
    }

    return activity;
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    title: v.string(),
    activityType: activityTypeValidator,
    dueDate: v.number(),
    endDate: v.optional(v.number()),
    ownerId: v.id("users"),
    description: v.optional(v.string()),
    linkedEntityType: v.optional(v.string()),
    linkedEntityId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const activityId = await ctx.db.insert("scheduledActivities", {
      ...args,
      isCompleted: false,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "scheduledActivity",
      entityId: activityId,
      action: "created",
      description: `Created ${args.activityType} "${args.title}"`,
      performedBy: user._id,
    });

    // Schedule Google Calendar sync if connected
    await ctx.scheduler.runAfter(0, internal.google.calendar.createEvent, {
      organizationId: args.organizationId,
      activityId,
    });

    return activityId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.id("scheduledActivities"),
    title: v.optional(v.string()),
    activityType: v.optional(activityTypeValidator),
    dueDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    ownerId: v.optional(v.id("users")),
    description: v.optional(v.string()),
    linkedEntityType: v.optional(v.string()),
    linkedEntityId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const activity = await ctx.db.get(args.activityId);
    if (!activity || activity.organizationId !== args.organizationId) {
      throw new Error("Scheduled activity not found");
    }

    const { organizationId, activityId, ...updates } = args;
    await ctx.db.patch(activityId, { ...updates, updatedAt: Date.now() });

    await logActivity(ctx, {
      organizationId,
      entityType: "scheduledActivity",
      entityId: activityId,
      action: "updated",
      description: `Updated ${activity.activityType} "${activity.title}"`,
      performedBy: user._id,
    });

    // Sync to Google Calendar if linked
    if (activity.googleEventId) {
      await ctx.scheduler.runAfter(0, internal.google.calendar.updateEvent, {
        organizationId,
        activityId,
      });
    }

    return activityId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.id("scheduledActivities"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const activity = await ctx.db.get(args.activityId);
    if (!activity || activity.organizationId !== args.organizationId) {
      throw new Error("Scheduled activity not found");
    }

    // Delete Google Calendar event before removing the activity
    if (activity.googleEventId) {
      await ctx.scheduler.runAfter(0, internal.google.calendar.deleteEvent, {
        organizationId: args.organizationId,
        activityId: args.activityId,
      });
    }

    await ctx.db.delete(args.activityId);

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "scheduledActivity",
      entityId: args.activityId,
      action: "deleted",
      description: `Deleted ${activity.activityType} "${activity.title}"`,
      performedBy: user._id,
    });

    return args.activityId;
  },
});

export const markComplete = mutation({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.id("scheduledActivities"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const activity = await ctx.db.get(args.activityId);
    if (!activity || activity.organizationId !== args.organizationId) {
      throw new Error("Scheduled activity not found");
    }

    const now = Date.now();
    await ctx.db.patch(args.activityId, {
      isCompleted: true,
      completedAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "scheduledActivity",
      entityId: args.activityId,
      action: "updated",
      description: `Completed ${activity.activityType} "${activity.title}"`,
      performedBy: user._id,
    });

    // Update Google Calendar event if linked
    if (activity.googleEventId) {
      await ctx.scheduler.runAfter(0, internal.google.calendar.updateEvent, {
        organizationId: args.organizationId,
        activityId: args.activityId,
      });
    }

    return args.activityId;
  },
});

export const markIncomplete = mutation({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.id("scheduledActivities"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const activity = await ctx.db.get(args.activityId);
    if (!activity || activity.organizationId !== args.organizationId) {
      throw new Error("Scheduled activity not found");
    }

    await ctx.db.patch(args.activityId, {
      isCompleted: false,
      completedAt: undefined,
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "scheduledActivity",
      entityId: args.activityId,
      action: "updated",
      description: `Reopened ${activity.activityType} "${activity.title}"`,
      performedBy: user._id,
    });

    return args.activityId;
  },
});

export const listByEntity = query({
  args: {
    organizationId: v.id("organizations"),
    linkedEntityType: v.string(),
    linkedEntityId: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const all = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return all.filter(
      (a) => a.linkedEntityType === args.linkedEntityType && a.linkedEntityId === args.linkedEntityId
    );
  },
});

export const listOverdue = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const incomplete = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_orgAndCompleted", (q) =>
        q.eq("organizationId", args.organizationId).eq("isCompleted", false)
      )
      .collect();

    return incomplete.filter((a) => a.dueDate < now);
  },
});

export const listDueToday = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

    const results = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_orgAndDueDate", (q) =>
        q.eq("organizationId", args.organizationId).gte("dueDate", startOfDay).lte("dueDate", endOfDay)
      )
      .collect();

    return results;
  },
});

export const listDueThisWeek = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfWeek = startOfDay + 7 * 24 * 60 * 60 * 1000;

    const results = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_orgAndDueDate", (q) =>
        q.eq("organizationId", args.organizationId).gte("dueDate", startOfDay).lte("dueDate", endOfWeek)
      )
      .collect();

    return results;
  },
});
