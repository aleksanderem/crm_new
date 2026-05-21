/**
 * Supabase-primary helpers for Google Calendar sync.
 *
 * These are plain async functions (not Convex mutations) so they can be called
 * from an `internalAction` like `syncCalendarConfig` and write directly to
 * Supabase via `supabaseDb`. They replace the older `calendarSyncHelpers.ts`
 * internalMutations that wrote to Convex DB and dual-wrote to Supabase.
 */

import { createSupabaseDb } from "../_helpers/supabaseDb";

type SupabaseDb = ReturnType<typeof createSupabaseDb>;

export type VisibilityOverride = "full" | "busy_only" | "hidden";

export async function findPatientByEmailSupabase(
  db: SupabaseDb,
  organizationId: string,
  email: string,
): Promise<{ id: string } | null> {
  const rows = await db
    .query("gabinetPatients")
    .eq("organizationId", organizationId)
    .eq("email", email)
    .take(1)
    .collect();
  const first = rows[0];
  return first ? { id: String(first._id) } : null;
}

export async function createSkeletonPatientSupabase(
  db: SupabaseDb,
  args: {
    organizationId: string;
    firstName: string;
    lastName: string;
    email: string;
    createdBy: string;
  },
): Promise<string> {
  const now = Date.now();
  return await db.insert("gabinetPatients", {
    organizationId: args.organizationId,
    firstName: args.firstName,
    lastName: args.lastName,
    email: args.email,
    isActive: true,
    createdBy: args.createdBy,
    createdAt: now,
    updatedAt: now,
  });
}

export async function findTreatmentByNameSupabase(
  db: SupabaseDb,
  organizationId: string,
  searchTerm: string,
): Promise<{ id: string; name: string } | null> {
  const term = searchTerm.toLowerCase();
  const rows = await db
    .query("gabinetTreatments")
    .eq("organizationId", organizationId)
    .collect();
  const match = rows.find((t) => {
    const name = ((t.name as string) ?? "").toLowerCase();
    return name && (name === term || term.includes(name) || name.includes(term));
  });
  return match ? { id: String(match._id), name: String(match.name) } : null;
}

export async function findEmployeeByUserIdSupabase(
  db: SupabaseDb,
  organizationId: string,
  userId: string,
): Promise<{ id: string; userId: string } | null> {
  const rows = await db
    .query("gabinetEmployees")
    .eq("organizationId", organizationId)
    .eq("userId", userId)
    .take(1)
    .collect();
  const first = rows[0];
  return first
    ? { id: String(first._id), userId: String(first.userId) }
    : null;
}

export async function findScheduledActivityByGoogleEventIdSupabase(
  db: SupabaseDb,
  organizationId: string,
  googleEventId: string,
): Promise<Record<string, unknown> | null> {
  const rows = await db
    .query("scheduledActivities")
    .eq("organizationId", organizationId)
    .eq("googleEventId", googleEventId)
    .take(1)
    .collect();
  return rows[0] ?? null;
}

/**
 * Upsert a list of Google Calendar events as `scheduledActivities` in Supabase.
 * Used for CRM imports and gabinet "blocked time" slots (no attendee).
 */
export async function upsertFromGoogleImportSupabase(
  db: SupabaseDb,
  args: {
    organizationId: string;
    ownerId: string;
    events: Array<{
      googleEventId: string;
      googleCalendarId: string;
      title: string;
      description?: string;
      location?: string;
      meetingUrl?: string;
      dueDate: number;
      endDate?: number;
      activityType: string;
      sourceType?: "manual" | "google" | "system";
      syncConfigId?: string;
      requiresCompletion?: boolean;
      visibilityOverride?: VisibilityOverride;
    }>;
  },
): Promise<{ imported: number; updated: number }> {
  const now = Date.now();
  let imported = 0;
  let updated = 0;

  for (const ev of args.events) {
    const existing = await findScheduledActivityByGoogleEventIdSupabase(
      db,
      args.organizationId,
      ev.googleEventId,
    );

    if (existing) {
      await db.patch("scheduledActivities", String(existing.id ?? existing._id), {
        title: ev.title,
        description: ev.description ?? null,
        location: ev.location ?? null,
        meetingUrl: ev.meetingUrl ?? null,
        dueDate: ev.dueDate,
        endDate: ev.endDate ?? null,
        sourceType: ev.sourceType ?? null,
        syncConfigId: ev.syncConfigId ?? null,
        requiresCompletion: ev.requiresCompletion ?? null,
        visibilityOverride: ev.visibilityOverride ?? null,
        lastGoogleSyncAt: now,
        updatedAt: now,
      });
      updated++;
    } else {
      await db.insert("scheduledActivities", {
        organizationId: args.organizationId,
        title: ev.title,
        description: ev.description ?? null,
        location: ev.location ?? null,
        meetingUrl: ev.meetingUrl ?? null,
        activityType: ev.activityType,
        dueDate: ev.dueDate,
        endDate: ev.endDate ?? null,
        isCompleted: false,
        ownerId: args.ownerId,
        googleEventId: ev.googleEventId,
        googleCalendarId: ev.googleCalendarId,
        sourceType: ev.sourceType ?? null,
        syncConfigId: ev.syncConfigId ?? null,
        requiresCompletion: ev.requiresCompletion ?? null,
        visibilityOverride: ev.visibilityOverride ?? null,
        lastGoogleSyncAt: now,
        createdBy: args.ownerId,
        createdAt: now,
        updatedAt: now,
      });
      imported++;
    }
  }

  return { imported, updated };
}

/**
 * Create or update a gabinet appointment + its linked scheduledActivity in Supabase
 * from a Google Calendar event that has an attendee resolved to a patient.
 */
export async function createAppointmentFromSyncSupabase(
  db: SupabaseDb,
  args: {
    organizationId: string;
    patientId: string;
    treatmentId?: string;
    employeeUserId: string;
    date: string;
    startTime: string;
    endTime: string;
    requiresCompletion: boolean;
    title: string;
    description?: string;
    location?: string;
    meetingUrl?: string;
    dueDate: number;
    endDateTs: number;
    ownerId: string;
    googleEventId: string;
    googleCalendarId: string;
    syncConfigId: string;
    visibilityOverride: VisibilityOverride;
  },
): Promise<
  | { type: "updated"; activityId: string }
  | { type: "created"; activityId: string; appointmentId: string }
> {
  const now = Date.now();

  const existing = await findScheduledActivityByGoogleEventIdSupabase(
    db,
    args.organizationId,
    args.googleEventId,
  );

  if (existing) {
    const existingId = String(existing.id ?? existing._id);
    await db.patch("scheduledActivities", existingId, {
      title: args.title,
      description: args.description ?? null,
      location: args.location ?? null,
      meetingUrl: args.meetingUrl ?? null,
      dueDate: args.dueDate,
      endDate: args.endDateTs,
      requiresCompletion: args.requiresCompletion,
      visibilityOverride: args.visibilityOverride,
      lastGoogleSyncAt: now,
      updatedAt: now,
    });
    const moduleRef = existing.moduleRef as { entityId?: string } | undefined;
    if (moduleRef?.entityId) {
      await db.patch("gabinetAppointments", String(moduleRef.entityId), {
        date: args.date,
        startTime: args.startTime,
        endTime: args.endTime,
        requiresCompletion: args.requiresCompletion,
        ...(args.treatmentId ? { treatmentId: args.treatmentId } : {}),
        updatedAt: now,
      });
    }
    return { type: "updated", activityId: existingId };
  }

  // Create scheduledActivity first (with placeholder moduleRef)
  const activityId = await db.insert("scheduledActivities", {
    organizationId: args.organizationId,
    title: args.title,
    activityType: "appointment",
    dueDate: args.dueDate,
    endDate: args.endDateTs,
    isCompleted: false,
    ownerId: args.ownerId,
    description: args.description ?? null,
    location: args.location ?? null,
    meetingUrl: args.meetingUrl ?? null,
    googleEventId: args.googleEventId,
    googleCalendarId: args.googleCalendarId,
    lastGoogleSyncAt: now,
    sourceType: "google",
    syncConfigId: args.syncConfigId,
    requiresCompletion: args.requiresCompletion,
    visibilityOverride: args.visibilityOverride,
    moduleRef: {
      moduleId: "gabinet",
      entityType: "gabinetAppointment",
      entityId: "",
    },
    createdBy: args.ownerId,
    createdAt: now,
    updatedAt: now,
  });

  // Create gabinetAppointment
  const appointmentId = await db.insert("gabinetAppointments", {
    organizationId: args.organizationId,
    patientId: args.patientId,
    treatmentId: args.treatmentId ?? null,
    employeeId: args.employeeUserId,
    date: args.date,
    startTime: args.startTime,
    endTime: args.endTime,
    status: "scheduled",
    isRecurring: false,
    scheduledActivityId: activityId,
    requiresCompletion: args.requiresCompletion,
    createdBy: args.ownerId,
    createdAt: now,
    updatedAt: now,
  });

  // Patch moduleRef with real appointmentId
  await db.patch("scheduledActivities", activityId, {
    moduleRef: {
      moduleId: "gabinet",
      entityType: "gabinetAppointment",
      entityId: appointmentId,
    },
  });

  return { type: "created", activityId, appointmentId };
}

/**
 * Delete scheduledActivity (and linked gabinet appointment) by googleEventId.
 */
export async function deleteByGoogleEventIdSupabase(
  db: SupabaseDb,
  organizationId: string,
  googleEventId: string,
): Promise<{ deleted: boolean }> {
  const activity = await findScheduledActivityByGoogleEventIdSupabase(
    db,
    organizationId,
    googleEventId,
  );
  if (!activity) return { deleted: false };

  const moduleRef = activity.moduleRef as
    | { moduleId?: string; entityType?: string; entityId?: string }
    | undefined;
  if (
    moduleRef?.moduleId === "gabinet" &&
    moduleRef?.entityType === "gabinetAppointment" &&
    moduleRef?.entityId
  ) {
    try {
      await db.delete("gabinetAppointments", String(moduleRef.entityId));
    } catch {
      // appointment may have been deleted separately
    }
  }

  await db.delete("scheduledActivities", String(activity.id ?? activity._id));
  return { deleted: true };
}
