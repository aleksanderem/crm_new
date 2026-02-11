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
