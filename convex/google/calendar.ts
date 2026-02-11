import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getValidAccessToken } from "./_helpers";

export const createEvent = internalAction({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.id("scheduledActivities"),
  },
  handler: async (ctx, args) => {
    const token = await getValidAccessToken(ctx, args.organizationId);
    if (!token) return; // No Google connection — silently skip

    const activity = await ctx.runQuery(
      internal.scheduledActivities_internal.getById,
      { activityId: args.activityId }
    );
    if (!activity) return;

    const startDate = new Date(activity.dueDate);
    const endDate = activity.endDate
      ? new Date(activity.endDate)
      : new Date(startDate.getTime() + 60 * 60 * 1000); // default 1 hour

    const event = {
      summary: activity.title,
      description: activity.description ?? "",
      start: { dateTime: startDate.toISOString() },
      end: { dateTime: endDate.toISOString() },
    };

    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Google Calendar create failed:", errText);
      return;
    }

    const result = await response.json();

    await ctx.runMutation(
      internal.scheduledActivities_internal.updateGoogleEventId,
      {
        activityId: args.activityId,
        googleEventId: result.id as string,
        googleCalendarId: "primary",
      }
    );
  },
});

export const updateEvent = internalAction({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.id("scheduledActivities"),
  },
  handler: async (ctx, args) => {
    const token = await getValidAccessToken(ctx, args.organizationId);
    if (!token) return;

    const activity = await ctx.runQuery(
      internal.scheduledActivities_internal.getById,
      { activityId: args.activityId }
    );
    if (!activity || !activity.googleEventId) return;

    const startDate = new Date(activity.dueDate);
    const endDate = activity.endDate
      ? new Date(activity.endDate)
      : new Date(startDate.getTime() + 60 * 60 * 1000);

    const event = {
      summary: activity.title,
      description: activity.description ?? "",
      start: { dateTime: startDate.toISOString() },
      end: { dateTime: endDate.toISOString() },
    };

    const calendarId = activity.googleCalendarId ?? "primary";

    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${activity.googleEventId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );
  },
});

export const deleteEvent = internalAction({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.id("scheduledActivities"),
  },
  handler: async (ctx, args) => {
    const token = await getValidAccessToken(ctx, args.organizationId);
    if (!token) return;

    const activity = await ctx.runQuery(
      internal.scheduledActivities_internal.getById,
      { activityId: args.activityId }
    );
    if (!activity || !activity.googleEventId) return;

    const calendarId = activity.googleCalendarId ?? "primary";

    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${activity.googleEventId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token.accessToken}` },
      }
    );

    await ctx.runMutation(
      internal.scheduledActivities_internal.clearGoogleEventId,
      { activityId: args.activityId }
    );
  },
});
