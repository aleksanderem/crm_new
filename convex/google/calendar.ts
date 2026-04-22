import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { auth as authModule } from "@cvx/auth";
import { getValidAccessToken, getValidAccessTokenForConnection } from "./_helpers";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { upsertFromGoogleImportSupabase } from "./calendarSyncHelpers_supabase";

export const createEvent = internalAction({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.string(),
  },
  handler: async (ctx, args) => {
    const token = await getValidAccessToken(ctx, args.organizationId);
    if (!token) return; // No Google connection — silently skip

    const db = createSupabaseDb();
    const activity = await db.get("scheduledActivities", args.activityId);
    if (!activity) return;

    const startDate = new Date(activity.dueDate as number);
    const endDate = activity.endDate
      ? new Date(activity.endDate as number)
      : new Date(startDate.getTime() + 60 * 60 * 1000); // default 1 hour

    const event = {
      summary: activity.title,
      description: (activity.description as string | null) ?? "",
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

    await db.patch("scheduledActivities", args.activityId, {
      googleEventId: result.id as string,
      googleCalendarId: "primary",
      lastGoogleSyncAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateEvent = internalAction({
  args: {
    organizationId: v.id("organizations"),
    activityId: v.string(),
  },
  handler: async (ctx, args) => {
    const token = await getValidAccessToken(ctx, args.organizationId);
    if (!token) return;

    const db = createSupabaseDb();
    const activity = await db.get("scheduledActivities", args.activityId);
    if (!activity || !activity.googleEventId) return;

    const startDate = new Date(activity.dueDate as number);
    const endDate = activity.endDate
      ? new Date(activity.endDate as number)
      : new Date(startDate.getTime() + 60 * 60 * 1000);

    const event = {
      summary: activity.title,
      description: (activity.description as string | null) ?? "",
      start: { dateTime: startDate.toISOString() },
      end: { dateTime: endDate.toISOString() },
    };

    const calendarId = (activity.googleCalendarId as string | null) ?? "primary";

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
    activityId: v.string(),
  },
  handler: async (ctx, args) => {
    const token = await getValidAccessToken(ctx, args.organizationId);
    if (!token) return;

    const db = createSupabaseDb();
    const activity = await db.get("scheduledActivities", args.activityId);
    if (!activity || !activity.googleEventId) return;

    const calendarId = (activity.googleCalendarId as string | null) ?? "primary";

    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${activity.googleEventId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token.accessToken}` },
      }
    );

    await db.patch("scheduledActivities", args.activityId, {
      googleEventId: null,
      googleCalendarId: null,
      lastGoogleSyncAt: null,
      updatedAt: Date.now(),
    });
  },
});

// --- Import from Google Calendar ---

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  status?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType?: string;
      uri?: string;
    }>;
  };
}

function parseGoogleDateTime(dt?: { dateTime?: string; date?: string }): number | null {
  if (!dt) return null;
  if (dt.dateTime) return new Date(dt.dateTime).getTime();
  if (dt.date) return new Date(dt.date).getTime();
  return null;
}

export const importFromGoogle = action({
  args: {
    organizationId: v.id("organizations"),
    ownerId: v.id("users"),
    daysBack: v.optional(v.number()),
    daysForward: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const token = await getValidAccessToken(ctx, args.organizationId);
    if (!token) throw new Error("Google Calendar not connected");

    const daysBack = args.daysBack ?? 30;
    const daysForward = args.daysForward ?? 90;
    const now = new Date();
    const timeMin = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1000).toISOString();

    // Fetch events from Google Calendar API
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      maxResults: "500",
      singleEvents: "true",
      orderBy: "startTime",
    });

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Google Calendar import failed:", errText);
      throw new Error("Failed to fetch events from Google Calendar");
    }

    const data = await response.json();
    const items: GoogleCalendarEvent[] = data.items ?? [];

    // Filter out cancelled events and events without start times
    const validEvents = items.filter(
      (item) => item.status !== "cancelled" && item.start && item.id
    );

    // Map to our format
    const eventsToImport = validEvents
      .map((item) => {
        const dueDate = parseGoogleDateTime(item.start);
        const endDate = parseGoogleDateTime(item.end);
        if (!dueDate) return null;

        // Extract Google Meet link: hangoutLink or conferenceData entryPoints
        let meetingUrl = item.hangoutLink;
        if (!meetingUrl && item.conferenceData?.entryPoints) {
          const videoEntry = item.conferenceData.entryPoints.find(
            (ep) => ep.entryPointType === "video"
          );
          meetingUrl = videoEntry?.uri;
        }

        return {
          googleEventId: item.id,
          googleCalendarId: "primary",
          title: item.summary || "Untitled Event",
          description: item.description,
          location: item.location,
          meetingUrl: meetingUrl ?? undefined,
          dueDate,
          endDate: endDate ?? undefined,
          activityType: "meeting" as const,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    if (eventsToImport.length === 0) {
      return { imported: 0, updated: 0, total: 0 };
    }

    // Batch insert/update — Convex mutations have limits, process in chunks of 50
    let totalImported = 0;
    let totalUpdated = 0;
    const BATCH_SIZE = 50;

    const db = createSupabaseDb();
    for (let i = 0; i < eventsToImport.length; i += BATCH_SIZE) {
      const batch = eventsToImport.slice(i, i + BATCH_SIZE);
      const result = await upsertFromGoogleImportSupabase(db, {
        organizationId: String(args.organizationId),
        ownerId: String(args.ownerId),
        events: batch.map((b) => ({
          googleEventId: b.googleEventId,
          googleCalendarId: b.googleCalendarId,
          title: b.title,
          description: b.description,
          location: b.location,
          meetingUrl: b.meetingUrl,
          dueDate: b.dueDate,
          endDate: b.endDate,
          activityType: b.activityType,
        })),
      });
      totalImported += result.imported;
      totalUpdated += result.updated;
    }

    return {
      imported: totalImported,
      updated: totalUpdated,
      total: eventsToImport.length,
    };
  },
});

export const listUserCalendars = action({
  args: { organizationId: v.id("organizations"), connectionId: v.id("oauthConnections") },
  handler: async (ctx, args) => {
    const userId = await authModule.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Verify the connection belongs to the calling user
    const connection = await ctx.runQuery(
      internal.oauthConnections.getById,
      { connectionId: args.connectionId }
    );
    if (!connection || (connection.userId && connection.userId !== userId)) {
      throw new Error("Connection not found or not owned by you");
    }

    const auth = await getValidAccessTokenForConnection(ctx, args.connectionId);
    if (!auth) throw new Error("Google not connected");

    const resp = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      { headers: { Authorization: `Bearer ${auth.accessToken}` } }
    );
    if (!resp.ok) throw new Error(`Google API error: ${resp.status}`);

    const data = await resp.json();
    return (data.items ?? []).map((cal: any) => ({
      id: cal.id,
      summary: cal.summary,
      description: cal.description,
      primary: cal.primary ?? false,
      backgroundColor: cal.backgroundColor,
      accessRole: cal.accessRole,
    }));
  },
});
