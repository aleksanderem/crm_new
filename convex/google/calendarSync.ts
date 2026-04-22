// @ts-nocheck -- TS2589: generated internal API types exceed TypeScript instantiation depth limit
import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { auth } from "@cvx/auth";
import type { Doc } from "../_generated/dataModel";
import { getValidAccessTokenForConnection } from "./_helpers";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import {
  createAppointmentFromSyncSupabase,
  createSkeletonPatientSupabase,
  deleteByGoogleEventIdSupabase,
  findEmployeeByUserIdSupabase,
  findPatientByEmailSupabase,
  findTreatmentByNameSupabase,
  upsertFromGoogleImportSupabase,
} from "./calendarSyncHelpers_supabase";

interface GoogleCalendarEvent {
  id: string;
  status: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType: string; uri: string }>;
  };
  attendees?: Array<{ email?: string; displayName?: string; self?: boolean }>;
}

interface GoogleEventsListResponse {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

function extractMeetUrl(event: GoogleCalendarEvent): string | undefined {
  if (event.hangoutLink) return event.hangoutLink;
  const videoEntry = event.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === "video"
  );
  return videoEntry?.uri;
}

function parseGoogleDateTime(dt?: {
  dateTime?: string;
  date?: string;
}): number | undefined {
  if (!dt) return undefined;
  if (dt.dateTime) return new Date(dt.dateTime).getTime();
  if (dt.date) return new Date(dt.date).getTime();
  return undefined;
}

export const syncCalendarConfig = internalAction({
  args: { configId: v.id("googleCalendarSyncConfigs") },
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.googleCalendarSyncConfigs.getById,
      { configId: args.configId }
    );
    if (!config || !config.syncEnabled) return { synced: 0 };

    await ctx.runMutation(
      internal.googleCalendarSyncConfigs.updateSyncState,
      { configId: args.configId, syncStatus: "syncing" }
    );

    try {
      const auth = await getValidAccessTokenForConnection(
        ctx,
        config.connectionId
      );
      if (!auth) {
        await ctx.runMutation(
          internal.googleCalendarSyncConfigs.updateSyncState,
          {
            configId: args.configId,
            syncStatus: "error",
            syncError: "OAuth token unavailable",
          }
        );
        return { synced: 0, error: "OAuth token unavailable" };
      }

      const allEvents: GoogleCalendarEvent[] = [];
      let pageToken: string | undefined;
      let nextSyncToken: string | undefined;

      do {
        const params = new URLSearchParams({
          maxResults: "250",
          singleEvents: "true",
        });

        if (config.lastSyncToken && !pageToken) {
          // Incremental sync using syncToken
          params.set("syncToken", config.lastSyncToken);
        } else if (!config.lastSyncToken && !pageToken) {
          // Full sync: fetch events from 30 days ago to 60 days forward
          const now = new Date();
          const timeMin = new Date(
            now.getTime() - 30 * 24 * 60 * 60 * 1000
          );
          const timeMax = new Date(
            now.getTime() + 60 * 24 * 60 * 60 * 1000
          );
          params.set("timeMin", timeMin.toISOString());
          params.set("timeMax", timeMax.toISOString());
          params.set("orderBy", "startTime");
        }

        if (pageToken) {
          params.set("pageToken", pageToken);
        }

        const calId = encodeURIComponent(config.googleCalendarId);
        const url = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?${params}`;

        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${auth.accessToken}` },
        });

        if (resp.status === 410) {
          // syncToken invalidated — clear it and retry with full sync
          await ctx.runMutation(
            internal.googleCalendarSyncConfigs.resetSyncToken,
            { configId: args.configId }
          );
          await ctx.scheduler.runAfter(
            0,
            internal.google.calendarSync.syncCalendarConfig,
            { configId: args.configId }
          );
          return { synced: 0, retrying: true };
        }

        if (!resp.ok) {
          const errorText = await resp.text();
          throw new Error(`Google API error ${resp.status}: ${errorText}`);
        }

        const data: GoogleEventsListResponse = await resp.json();
        if (data.items) {
          allEvents.push(...data.items);
        }
        pageToken = data.nextPageToken;
        if (data.nextSyncToken) {
          nextSyncToken = data.nextSyncToken;
        }
      } while (pageToken);

      // Handle cancelled events — delete corresponding records (Supabase-primary)
      const db = createSupabaseDb();
      const cancelledEvents = allEvents.filter(
        (e) => e.status === "cancelled"
      );
      for (const cancelled of cancelledEvents) {
        try {
          await deleteByGoogleEventIdSupabase(
            db,
            String(config.organizationId),
            cancelled.id,
          );
        } catch (e) {
          console.warn("[syncCalendarConfig] delete failed:", e);
        }
      }

      const validEvents = allEvents.filter(
        (e) => e.status !== "cancelled" && e.start
      );

      let synced = 0;

      if (config.targetModule === "crm") {
        synced = await resolveCrmEvents(ctx, config, validEvents);
      } else if (config.targetModule === "gabinet") {
        synced = await resolveGabinetEvents(ctx, config, validEvents);
      }

      const syncStateUpdate: {
        configId: typeof args.configId;
        syncStatus: "idle";
        lastSyncAt: number;
        lastSyncToken?: string;
      } = {
        configId: args.configId,
        syncStatus: "idle" as const,
        lastSyncAt: Date.now(),
      };
      if (nextSyncToken) {
        syncStateUpdate.lastSyncToken = nextSyncToken;
      }

      await ctx.runMutation(
        internal.googleCalendarSyncConfigs.updateSyncState,
        syncStateUpdate
      );

      return { synced };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error";
      await ctx.runMutation(
        internal.googleCalendarSyncConfigs.updateSyncState,
        {
          configId: args.configId,
          syncStatus: "error",
          syncError: errorMsg,
        }
      );
      return { synced: 0, error: errorMsg };
    }
  },
});

async function resolveCrmEvents(
  ctx: any,
  config: Doc<"googleCalendarSyncConfigs">,
  events: GoogleCalendarEvent[]
): Promise<number> {
  const activityType = config.targetActivityType ?? "meeting";
  const batchSize = 50;
  let total = 0;

  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    const mapped = batch
      .map((event) => ({
        googleEventId: event.id,
        googleCalendarId: config.googleCalendarId,
        title: event.summary ?? "(Bez tytułu)",
        description: event.description,
        location: event.location,
        meetingUrl: extractMeetUrl(event),
        dueDate: parseGoogleDateTime(event.start),
        endDate: parseGoogleDateTime(event.end),
        activityType,
        sourceType: "google" as const,
        syncConfigId: config._id,
        requiresCompletion: false,
        visibilityOverride: config.visibility,
      }))
      .filter(
        (e): e is typeof e & { dueDate: number } => e.dueDate !== undefined
      );

    if (mapped.length > 0) {
      const db = createSupabaseDb();
      const result = await upsertFromGoogleImportSupabase(db, {
        organizationId: String(config.organizationId),
        ownerId: String(config.userId),
        events: mapped.map((m) => ({
          googleEventId: m.googleEventId,
          googleCalendarId: m.googleCalendarId,
          title: m.title,
          description: m.description,
          location: m.location,
          meetingUrl: m.meetingUrl,
          dueDate: m.dueDate,
          endDate: m.endDate,
          activityType: m.activityType,
          sourceType: m.sourceType,
          syncConfigId: String(m.syncConfigId),
          requiresCompletion: m.requiresCompletion,
          visibilityOverride: m.visibilityOverride,
        })),
      });
      total += result.imported + result.updated;
    }
  }

  return total;
}

async function resolveGabinetEvents(
  _ctx: any,
  config: Doc<"googleCalendarSyncConfigs">,
  events: GoogleCalendarEvent[]
): Promise<number> {
  const db = createSupabaseDb();
  const orgId = String(config.organizationId);
  const ownerId = String(config.userId);

  const employee = await findEmployeeByUserIdSupabase(db, orgId, ownerId);

  let synced = 0;

  for (const event of events) {
    const dueDate = parseGoogleDateTime(event.start);
    const endDate = parseGoogleDateTime(event.end);
    if (!dueDate || !endDate) continue;

    const startDt = new Date(dueDate);
    const endDt = new Date(endDate);
    const date = startDt.toISOString().split("T")[0];
    const startTime = `${String(startDt.getHours()).padStart(2, "0")}:${String(startDt.getMinutes()).padStart(2, "0")}`;
    const endTime = `${String(endDt.getHours()).padStart(2, "0")}:${String(endDt.getMinutes()).padStart(2, "0")}`;

    const attendee = event.attendees?.find((a) => a.email && !a.self);

    if (!attendee?.email || !employee) {
      // No attendee or no linked employee — blocked time slot
      await upsertFromGoogleImportSupabase(db, {
        organizationId: orgId,
        ownerId,
        events: [
          {
            googleEventId: event.id,
            googleCalendarId: config.googleCalendarId,
            title:
              config.visibility === "busy_only"
                ? "Zajęty"
                : (event.summary ?? "(Bez tytułu)"),
            description:
              config.visibility === "busy_only" ? undefined : event.description,
            location:
              config.visibility === "busy_only" ? undefined : event.location,
            meetingUrl: extractMeetUrl(event),
            dueDate,
            endDate,
            activityType: "blocked_time",
            sourceType: "google",
            syncConfigId: String(config._id),
            requiresCompletion: false,
            visibilityOverride: config.visibility,
          },
        ],
      });
      synced++;
      continue;
    }

    // Find or create patient by attendee email (Supabase-primary)
    let patientId: string;
    let patientIsNew = false;

    const existingPatient = await findPatientByEmailSupabase(
      db,
      orgId,
      attendee.email,
    );

    if (existingPatient) {
      patientId = existingPatient.id;
    } else {
      const nameParts = (
        attendee.displayName ?? attendee.email.split("@")[0]
      ).split(" ");
      const firstName = nameParts[0] ?? "";
      const lastName = nameParts.slice(1).join(" ") || "";

      patientId = await createSkeletonPatientSupabase(db, {
        organizationId: orgId,
        firstName,
        lastName,
        email: attendee.email,
        createdBy: ownerId,
      });
      patientIsNew = true;
    }

    // Fuzzy-match treatment from event summary
    let treatmentId: string | undefined;
    if (event.summary) {
      const matched = await findTreatmentByNameSupabase(
        db,
        orgId,
        event.summary,
      );
      if (matched) treatmentId = matched.id;
    }

    const requiresCompletion = !treatmentId || patientIsNew;

    await createAppointmentFromSyncSupabase(db, {
      organizationId: orgId,
      patientId,
      treatmentId,
      employeeUserId: employee.userId,
      date,
      startTime,
      endTime,
      requiresCompletion,
      title: event.summary ?? "(Bez tytułu)",
      description: event.description,
      location: event.location,
      meetingUrl: extractMeetUrl(event),
      dueDate,
      endDateTs: endDate,
      ownerId,
      googleEventId: event.id,
      googleCalendarId: config.googleCalendarId,
      syncConfigId: String(config._id),
      visibilityOverride: config.visibility,
    });
    synced++;
  }

  return synced;
}

export const syncAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scheduled: number }> => {
    const configs = await ctx.runQuery(
      internal.googleCalendarSyncConfigs.getEnabledConfigs,
      { limit: 5 }
    );

    for (const config of configs) {
      await ctx.scheduler.runAfter(0,
        internal.google.calendarSync.syncCalendarConfig,
        { configId: config._id }
      );
    }

    return { scheduled: configs.length };
  },
});

export const syncMyCalendars = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<{ calendarName: string | null; scheduled: boolean }[]> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const configs = await ctx.runQuery(
      internal.googleCalendarSyncConfigs.getByOrgAndUser,
      { organizationId: args.organizationId, userId }
    );

    const results: { calendarName: string | null; scheduled: boolean }[] = [];
    for (const config of configs) {
      if (!config.syncEnabled) continue;
      await ctx.scheduler.runAfter(0,
        internal.google.calendarSync.syncCalendarConfig,
        { configId: config._id }
      );
      results.push({ calendarName: config.googleCalendarName, scheduled: true });
    }

    return results;
  },
});
