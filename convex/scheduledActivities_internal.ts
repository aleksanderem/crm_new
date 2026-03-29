import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getById = internalQuery({
  args: { activityId: v.id("scheduledActivities") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.activityId);
  },
});

export const updateGoogleEventId = internalMutation({
  args: {
    activityId: v.id("scheduledActivities"),
    googleEventId: v.string(),
    googleCalendarId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.activityId, {
      googleEventId: args.googleEventId,
      googleCalendarId: args.googleCalendarId,
      lastGoogleSyncAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const clearGoogleEventId = internalMutation({
  args: { activityId: v.id("scheduledActivities") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.activityId, {
      googleEventId: undefined,
      googleCalendarId: undefined,
      lastGoogleSyncAt: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const findByGoogleEventId = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    googleEventId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scheduledActivities")
      .withIndex("by_orgAndGoogleEventId", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("googleEventId", args.googleEventId)
      )
      .first();
  },
});

export const deleteByGoogleEventId = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    googleEventId: v.string(),
  },
  handler: async (ctx, args) => {
    const activity = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_orgAndGoogleEventId", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("googleEventId", args.googleEventId)
      )
      .first();
    if (!activity) return { deleted: false };

    // If linked to a Gabinet appointment, delete it too
    if (
      activity.moduleRef?.moduleId === "gabinet" &&
      activity.moduleRef?.entityType === "gabinetAppointment" &&
      activity.moduleRef?.entityId
    ) {
      const appointment = await ctx.db.get(
        activity.moduleRef.entityId as any
      );
      if (appointment) {
        await ctx.db.delete(appointment._id);
      }
    }

    await ctx.db.delete(activity._id);
    return { deleted: true };
  },
});

export const upsertFromGoogleImport = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    ownerId: v.id("users"),
    events: v.array(
      v.object({
        googleEventId: v.string(),
        googleCalendarId: v.string(),
        title: v.string(),
        description: v.optional(v.string()),
        location: v.optional(v.string()),
        meetingUrl: v.optional(v.string()),
        dueDate: v.number(),
        endDate: v.optional(v.number()),
        activityType: v.string(),
        sourceType: v.optional(v.union(v.literal("manual"), v.literal("google"), v.literal("system"))),
        syncConfigId: v.optional(v.id("googleCalendarSyncConfigs")),
        requiresCompletion: v.optional(v.boolean()),
        visibilityOverride: v.optional(v.union(v.literal("full"), v.literal("busy_only"), v.literal("hidden"))),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let imported = 0;
    let updated = 0;

    for (const ev of args.events) {
      // Check if event already exists
      const existing = await ctx.db
        .query("scheduledActivities")
        .withIndex("by_orgAndGoogleEventId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("googleEventId", ev.googleEventId)
        )
        .first();

      if (existing) {
        // Update existing event
        await ctx.db.patch(existing._id, {
          title: ev.title,
          description: ev.description,
          location: ev.location,
          meetingUrl: ev.meetingUrl,
          dueDate: ev.dueDate,
          endDate: ev.endDate,
          sourceType: ev.sourceType,
          syncConfigId: ev.syncConfigId,
          requiresCompletion: ev.requiresCompletion,
          visibilityOverride: ev.visibilityOverride,
          lastGoogleSyncAt: now,
          updatedAt: now,
        });
        updated++;
      } else {
        // Create new event
        await ctx.db.insert("scheduledActivities", {
          organizationId: args.organizationId,
          title: ev.title,
          description: ev.description,
          location: ev.location,
          meetingUrl: ev.meetingUrl,
          activityType: ev.activityType,
          dueDate: ev.dueDate,
          endDate: ev.endDate,
          isCompleted: false,
          ownerId: args.ownerId,
          googleEventId: ev.googleEventId,
          googleCalendarId: ev.googleCalendarId,
          sourceType: ev.sourceType,
          syncConfigId: ev.syncConfigId,
          requiresCompletion: ev.requiresCompletion,
          visibilityOverride: ev.visibilityOverride,
          lastGoogleSyncAt: now,
          createdBy: args.ownerId,
          createdAt: now,
          updatedAt: now,
        });
        imported++;
      }
    }

    return { imported, updated };
  },
});
