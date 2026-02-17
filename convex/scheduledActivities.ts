import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { checkPermission } from "./_helpers/permissions";
import { activityTypeValidator } from "@cvx/schema";
import { createNotificationDirect } from "./notifications";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    activityType: v.optional(activityTypeValidator),
    isCompleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "activities", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const applyScope = (result: any) => {
      if (perm.scope === "own") {
        return { ...result, page: result.page.filter((r: any) => r.createdBy === user._id) };
      }
      return result;
    };

    if (args.activityType) {
      return applyScope(await ctx.db
        .query("scheduledActivities")
        .withIndex("by_orgAndType", (q) =>
          q.eq("organizationId", args.organizationId).eq("activityType", args.activityType!)
        )
        .order("desc")
        .paginate(args.paginationOpts));
    }

    if (args.isCompleted !== undefined) {
      return applyScope(await ctx.db
        .query("scheduledActivities")
        .withIndex("by_orgAndCompleted", (q) =>
          q.eq("organizationId", args.organizationId).eq("isCompleted", args.isCompleted!)
        )
        .order("desc")
        .paginate(args.paginationOpts));
    }

    return applyScope(await ctx.db
      .query("scheduledActivities")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts));
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.id("scheduledActivities"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "activities", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const activity = await ctx.db.get(args.activityId);
    if (!activity || activity.organizationId !== args.organizationId) {
      throw new Error("Scheduled activity not found");
    }
    if (perm.scope === "own" && activity.createdBy !== user._id) {
      throw new Error("Permission denied");
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
    const perm = await checkPermission(ctx, args.organizationId, "activities", "create");
    if (!perm.allowed) throw new Error("Permission denied");
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

    // Notify owner if different from creator
    if (args.ownerId !== user._id) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: args.ownerId,
        type: "assigned",
        title: "Activity assigned",
        message: `You have been assigned to ${args.activityType} "${args.title}"`,
      });
    }

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
    const perm = await checkPermission(ctx, args.organizationId, "activities", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const activity = await ctx.db.get(args.activityId);
    if (!activity || activity.organizationId !== args.organizationId) {
      throw new Error("Scheduled activity not found");
    }
    if (perm.scope === "own" && activity.createdBy !== user._id) {
      throw new Error("Permission denied: you can only edit your own records");
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

    // Notify new owner if ownerId changed to someone other than the current user
    if (updates.ownerId && updates.ownerId !== activity.ownerId && updates.ownerId !== user._id) {
      await createNotificationDirect(ctx, {
        organizationId,
        userId: updates.ownerId,
        type: "assigned",
        title: "Activity assigned",
        message: `You have been assigned to ${activity.activityType} "${activity.title}"`,
      });
    }

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
    const perm = await checkPermission(ctx, args.organizationId, "activities", "delete");
    if (!perm.allowed) throw new Error("Permission denied");

    const activity = await ctx.db.get(args.activityId);
    if (!activity || activity.organizationId !== args.organizationId) {
      throw new Error("Scheduled activity not found");
    }
    if (perm.scope === "own" && activity.createdBy !== user._id) {
      throw new Error("Permission denied: you can only delete your own records");
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
    const perm = await checkPermission(ctx, args.organizationId, "activities", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const activity = await ctx.db.get(args.activityId);
    if (!activity || activity.organizationId !== args.organizationId) {
      throw new Error("Scheduled activity not found");
    }
    if (perm.scope === "own" && activity.createdBy !== user._id) {
      throw new Error("Permission denied: you can only edit your own records");
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
    const perm = await checkPermission(ctx, args.organizationId, "activities", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const activity = await ctx.db.get(args.activityId);
    if (!activity || activity.organizationId !== args.organizationId) {
      throw new Error("Scheduled activity not found");
    }
    if (perm.scope === "own" && activity.createdBy !== user._id) {
      throw new Error("Permission denied: you can only edit your own records");
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
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "activities", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const all = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    let filtered = all.filter(
      (a) => a.linkedEntityType === args.linkedEntityType && a.linkedEntityId === args.linkedEntityId
    );
    if (perm.scope === "own") {
      filtered = filtered.filter((a) => a.createdBy === user._id);
    }
    return filtered;
  },
});

export const listOverdue = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "activities", "view");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();

    const incomplete = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_orgAndCompleted", (q) =>
        q.eq("organizationId", args.organizationId).eq("isCompleted", false)
      )
      .collect();

    let results = incomplete.filter((a) => a.dueDate < now);
    if (perm.scope === "own") {
      results = results.filter((a) => a.createdBy === user._id);
    }
    return results;
  },
});

export const listDueToday = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "activities", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

    const results = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_orgAndDueDate", (q) =>
        q.eq("organizationId", args.organizationId).gte("dueDate", startOfDay).lte("dueDate", endOfDay)
      )
      .collect();

    if (perm.scope === "own") {
      return results.filter((a) => a.createdBy === user._id);
    }
    return results;
  },
});

export const listForCalendar = query({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.number(),
    endDate: v.number(),
    moduleFilter: v.optional(
      v.union(v.literal("all"), v.literal("gabinet"), v.literal("crm"))
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(
      ctx,
      args.organizationId,
      "activities",
      "view"
    );
    if (!perm.allowed) throw new Error("Permission denied");

    const activities = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_orgAndDueDate", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .gte("dueDate", args.startDate)
          .lte("dueDate", args.endDate)
      )
      .collect();

    let filtered = activities;
    if (args.moduleFilter === "gabinet") {
      filtered = activities.filter(
        (a) => a.moduleRef?.moduleId === "gabinet"
      );
    } else if (args.moduleFilter === "crm") {
      filtered = activities.filter(
        (a) => !a.moduleRef || a.moduleRef.moduleId !== "gabinet"
      );
    }

    if (perm.scope === "own") {
      filtered = filtered.filter((a) => a.createdBy === user._id);
    }

    const enriched = await Promise.all(
      filtered.map(async (activity) => {
        let metadata: Record<string, unknown> = {};
        if (
          activity.moduleRef?.moduleId === "gabinet" &&
          activity.moduleRef.entityType === "gabinetAppointment"
        ) {
          const appt = await ctx.db.get(
            activity.moduleRef.entityId as any
          );
          if (appt) {
            const patient = await ctx.db.get((appt as any).patientId);
            const treatment = await ctx.db.get((appt as any).treatmentId);
            metadata = {
              patientName: patient
                ? `${(patient as any).firstName} ${(patient as any).lastName}`
                : "Unknown",
              treatmentName: (treatment as any)?.name ?? "Unknown",
              status: (appt as any).status,
              employeeId: (appt as any).employeeId,
              appointmentId: appt._id,
            };
          }
        }
        return { ...activity, metadata };
      })
    );

    return enriched;
  },
});

export const listDueThisWeek = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "activities", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfWeek = startOfDay + 7 * 24 * 60 * 60 * 1000;

    const results = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_orgAndDueDate", (q) =>
        q.eq("organizationId", args.organizationId).gte("dueDate", startOfDay).lte("dueDate", endOfWeek)
      )
      .collect();

    if (perm.scope === "own") {
      return results.filter((a) => a.createdBy === user._id);
    }
    return results;
  },
});
