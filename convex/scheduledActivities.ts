import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { logActivity } from "./_helpers/activities";
import { createNotificationDirect } from "./notifications";
import { v } from "convex/values";
import { activityTypeValidator } from "@cvx/schema";

// Supabase is primary for scheduledActivities. Writes go through
// createSupabaseDb() in the actions below; the frontend reads via
// use-supabase-scheduled-activities.ts.
//
// All public Convex query endpoints (list, getById, listByEntity,
// listOverdue, listDueToday, listForCalendar,
// listForCalendarWithVisibility, listDueThisWeek) were deleted as part of
// the migration.

// ── Internal mutation for activity log + notification side effects ──────────

export const _createSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.string(),
    activityType: v.string(),
    title: v.string(),
    userId: v.string(),
    ownerId: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "scheduledActivity",
      entityId: args.activityId as any,
      action: "created",
      description: `Created ${args.activityType} "${args.title}"`,
      performedBy: args.userId as any,
    });

    // Notify owner if different from creator
    if (args.ownerId !== args.userId) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: args.ownerId as any,
        type: "assigned",
        title: "Activity assigned",
        message: `You have been assigned to ${args.activityType} "${args.title}"`,
      });
    }

    // Schedule Google Calendar sync if connected
    await ctx.scheduler.runAfter(0, internal.google.calendar.createEvent, {
      organizationId: args.organizationId,
      activityId: args.activityId as any,
    });
  },
});

export const _updateSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.string(),
    activityType: v.string(),
    title: v.string(),
    userId: v.string(),
    newOwnerId: v.optional(v.string()),
    oldOwnerId: v.optional(v.string()),
    googleEventId: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "scheduledActivity",
      entityId: args.activityId as any,
      action: "updated",
      description: args.description ?? `Updated ${args.activityType} "${args.title}"`,
      performedBy: args.userId as any,
    });

    // Notify new owner if changed and not the current user
    if (args.newOwnerId && args.newOwnerId !== args.oldOwnerId && args.newOwnerId !== args.userId) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: args.newOwnerId as any,
        type: "assigned",
        title: "Activity assigned",
        message: `You have been assigned to ${args.activityType} "${args.title}"`,
      });
    }

    // Sync to Google Calendar if linked
    if (args.googleEventId) {
      await ctx.scheduler.runAfter(0, internal.google.calendar.updateEvent, {
        organizationId: args.organizationId,
        activityId: args.activityId as any,
      });
    }
  },
});

export const _deleteSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.string(),
    activityType: v.string(),
    title: v.string(),
    userId: v.string(),
    googleEventId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Delete Google Calendar event before removing the activity
    if (args.googleEventId) {
      await ctx.scheduler.runAfter(0, internal.google.calendar.deleteEvent, {
        organizationId: args.organizationId as any,
        activityId: args.activityId as any,
      });
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "scheduledActivity",
      entityId: args.activityId as any,
      action: "deleted",
      description: `Deleted ${args.activityType} "${args.title}"`,
      performedBy: args.userId as any,
    });
  },
});

// ── Actions (Supabase-primary writes) ───────────────────────────────────────

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    title: v.string(),
    activityType: activityTypeValidator,
    dueDate: v.number(),
    endDate: v.optional(v.number()),
    ownerId: v.string(),
    description: v.optional(v.string()),
    linkedEntityType: v.optional(v.string()),
    linkedEntityId: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    sourceType: v.optional(
      v.union(v.literal("manual"), v.literal("google"), v.literal("system")),
    ),
    moduleRef: v.optional(
      v.object({
        moduleId: v.string(),
        entityType: v.string(),
        entityId: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "activities", action: "create" },
    );
    if (!(perm as any).allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const now = Date.now();

    const activityId = await db.insert("scheduledActivities", {
      organizationId: String(args.organizationId),
      title: args.title,
      activityType: args.activityType,
      dueDate: args.dueDate,
      endDate: args.endDate ?? null,
      isCompleted: false,
      ownerId: args.ownerId,
      description: args.description ?? null,
      linkedEntityType: args.linkedEntityType ?? null,
      linkedEntityId: args.linkedEntityId ?? null,
      tagIds: args.tagIds ?? null,
      categoryId: args.categoryId ?? null,
      resourceId: args.resourceId ?? null,
      sourceType: args.sourceType ?? null,
      moduleRef: args.moduleRef ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    try {
      await ctx.runMutation(internal.scheduledActivities._createSideEffects, {
        organizationId: args.organizationId,
        activityId,
        activityType: args.activityType,
        title: args.title,
        userId: String(authResult.userId),
        ownerId: args.ownerId,
      });
    } catch (e) {
      console.error("[scheduledActivities.create] side effects error:", e);
    }

    return activityId;
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.string(),
    title: v.optional(v.string()),
    activityType: v.optional(activityTypeValidator),
    dueDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    ownerId: v.optional(v.string()),
    description: v.optional(v.string()),
    linkedEntityType: v.optional(v.string()),
    linkedEntityId: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    resourceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "activities", action: "edit" },
    );
    if (!(perm as any).allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const activity = await db.get("scheduledActivities", args.activityId);
    if (!activity || activity.organizationId !== String(args.organizationId)) {
      throw new Error("Scheduled activity not found");
    }
    if ((perm as any).scope === "own" && activity.createdBy !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const { organizationId, activityId, ...updates } = args;
    const now = Date.now();
    const patchData: Record<string, unknown> = { updatedAt: now };
    if (updates.title !== undefined) patchData.title = updates.title;
    if (updates.activityType !== undefined) patchData.activityType = updates.activityType;
    if (updates.dueDate !== undefined) patchData.dueDate = updates.dueDate;
    if (updates.endDate !== undefined) patchData.endDate = updates.endDate;
    if (updates.ownerId !== undefined) patchData.ownerId = updates.ownerId;
    if (updates.description !== undefined) patchData.description = updates.description;
    if (updates.linkedEntityType !== undefined) patchData.linkedEntityType = updates.linkedEntityType;
    if (updates.linkedEntityId !== undefined) patchData.linkedEntityId = updates.linkedEntityId;
    if (updates.tagIds !== undefined) patchData.tagIds = updates.tagIds;
    if (updates.categoryId !== undefined) patchData.categoryId = updates.categoryId;
    if (updates.resourceId !== undefined) patchData.resourceId = updates.resourceId;

    await db.patch("scheduledActivities", activityId, patchData);

    try {
      await ctx.runMutation(internal.scheduledActivities._updateSideEffects, {
        organizationId,
        activityId,
        activityType: (updates.activityType ?? activity.activityType) as string,
        title: (updates.title ?? activity.title) as string,
        userId: String(authResult.userId),
        newOwnerId: updates.ownerId,
        oldOwnerId: activity.ownerId as string | undefined,
        googleEventId: activity.googleEventId as string | undefined,
      });
    } catch (e) {
      console.error("[scheduledActivities.update] side effects error:", e);
    }

    return activityId;
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "activities", action: "delete" },
    );
    if (!(perm as any).allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const activity = await db.get("scheduledActivities", args.activityId);
    if (!activity || activity.organizationId !== String(args.organizationId)) {
      throw new Error("Scheduled activity not found");
    }
    if ((perm as any).scope === "own" && activity.createdBy !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    await db.delete("scheduledActivities", args.activityId);

    try {
      await ctx.runMutation(internal.scheduledActivities._deleteSideEffects, {
        organizationId: args.organizationId,
        activityId: args.activityId,
        activityType: activity.activityType as string,
        title: activity.title as string,
        userId: String(authResult.userId),
        googleEventId: activity.googleEventId as string | undefined,
      });
    } catch (e) {
      console.error("[scheduledActivities.remove] side effects error:", e);
    }

    return args.activityId;
  },
});

export const markComplete = action({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "activities", action: "edit" },
    );
    if (!(perm as any).allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const activity = await db.get("scheduledActivities", args.activityId);
    if (!activity || activity.organizationId !== String(args.organizationId)) {
      throw new Error("Scheduled activity not found");
    }
    if ((perm as any).scope === "own" && activity.createdBy !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const now = Date.now();
    await db.patch("scheduledActivities", args.activityId, {
      isCompleted: true,
      completedAt: now,
      updatedAt: now,
    });

    try {
      await ctx.runMutation(internal.scheduledActivities._updateSideEffects, {
        organizationId: args.organizationId,
        activityId: args.activityId,
        activityType: activity.activityType as string,
        title: activity.title as string,
        userId: String(authResult.userId),
        googleEventId: activity.googleEventId as string | undefined,
        description: `Completed ${activity.activityType} "${activity.title}"`,
      });
    } catch (e) {
      console.error("[scheduledActivities.markComplete] side effects error:", e);
    }

    return args.activityId;
  },
});

export const markIncomplete = action({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "activities", action: "edit" },
    );
    if (!(perm as any).allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const activity = await db.get("scheduledActivities", args.activityId);
    if (!activity || activity.organizationId !== String(args.organizationId)) {
      throw new Error("Scheduled activity not found");
    }
    if ((perm as any).scope === "own" && activity.createdBy !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    await db.patch("scheduledActivities", args.activityId, {
      isCompleted: false,
      completedAt: null,
      updatedAt: Date.now(),
    });

    try {
      await ctx.runMutation(internal.scheduledActivities._updateSideEffects, {
        organizationId: args.organizationId,
        activityId: args.activityId,
        activityType: activity.activityType as string,
        title: activity.title as string,
        userId: String(authResult.userId),
        description: `Reopened ${activity.activityType} "${activity.title}"`,
      });
    } catch (e) {
      console.error("[scheduledActivities.markIncomplete] side effects error:", e);
    }

    return args.activityId;
  },
});
