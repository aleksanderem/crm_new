import { query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { checkPermission } from "./_helpers/permissions";
import { activityTypeValidator } from "@cvx/schema";

// ── Queries (unchanged — still read from Convex) ────────────────────────────

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

// Shared helper: fetch, filter by module, apply scope, enrich with Gabinet metadata
async function fetchCalendarActivities(
  ctx: any,
  args: {
    organizationId: any;
    startDate: number;
    endDate: number;
    moduleFilter?: "all" | "gabinet" | "crm";
  },
  user: { _id: any },
  permScope: string
) {
  const activities = await ctx.db
    .query("scheduledActivities")
    .withIndex("by_orgAndDueDate", (q: any) =>
      q
        .eq("organizationId", args.organizationId)
        .gte("dueDate", args.startDate)
        .lte("dueDate", args.endDate)
    )
    .collect();

  let filtered = activities;
  if (args.moduleFilter === "gabinet") {
    filtered = activities.filter(
      (a: any) => a.moduleRef?.moduleId === "gabinet"
    );
  } else if (args.moduleFilter === "crm") {
    filtered = activities.filter(
      (a: any) => !a.moduleRef || a.moduleRef.moduleId !== "gabinet"
    );
  }

  if (permScope === "own") {
    filtered = filtered.filter((a: any) => a.createdBy === user._id);
  }

  const enriched = await Promise.all(
    filtered.map(async (activity: any) => {
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
}

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

    return fetchCalendarActivities(ctx, args, user, perm.scope);
  },
});

export const listForCalendarWithVisibility = query({
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

    const enriched = await fetchCalendarActivities(ctx, args, user, perm.scope);

    // Cache sync configs to avoid repeated lookups for the same config
    const syncConfigCache = new Map<string, any>();

    const visibilityFiltered: typeof enriched = [];

    for (const activity of enriched) {
      // Activities without syncConfigId are always fully visible
      if (!activity.syncConfigId) {
        visibilityFiltered.push(activity);
        continue;
      }

      // Owner always sees full details
      if (activity.ownerId === user._id) {
        visibilityFiltered.push(activity);
        continue;
      }

      // Determine effective visibility: per-event override takes precedence over sync config default
      let effectiveVisibility = activity.visibilityOverride;
      if (!effectiveVisibility) {
        const configIdStr = activity.syncConfigId as string;
        if (!syncConfigCache.has(configIdStr)) {
          syncConfigCache.set(configIdStr, await ctx.db.get(activity.syncConfigId));
        }
        const syncConfig = syncConfigCache.get(configIdStr);
        effectiveVisibility = syncConfig?.visibility ?? "full";
      }

      if (effectiveVisibility === "hidden") {
        // Exclude from results
        continue;
      }

      if (effectiveVisibility === "busy_only") {
        // Sanitize: replace title, clear sensitive fields, add marker
        visibilityFiltered.push({
          ...activity,
          title: "Zajęty",
          description: undefined,
          location: undefined,
          meetingUrl: undefined,
          _isBusyOnly: true as const,
        });
        continue;
      }

      // "full" — return as-is
      visibilityFiltered.push(activity);
    }

    return visibilityFiltered;
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

// ── Internal mutation for Convex-only side effects ──────────────────────────

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
    const { logActivity } = await import("./_helpers/activities");
    const { createNotificationDirect } = await import("./notifications");

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
    const { logActivity } = await import("./_helpers/activities");
    const { createNotificationDirect } = await import("./notifications");

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
    const { logActivity } = await import("./_helpers/activities");

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
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
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
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
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
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
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
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
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
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
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
