import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

export const findPatientByEmail = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gabinetPatients")
      .withIndex("by_orgAndEmail", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.email)
      )
      .first();
  },
});

export const createSkeletonPatient = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const patientId = await ctx.db.insert("gabinetPatients", {
      organizationId: args.organizationId,
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      isActive: true,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.supabase.gabinet.patients.writePatientToSupabase,
      {
        patientId: String(patientId),
        organizationId: String(args.organizationId),
        firstName: args.firstName,
        lastName: args.lastName,
        email: args.email,
        isActive: true,
        createdBy: String(args.createdBy),
        createdAt: now,
        updatedAt: now,
      },
    );

    return patientId;
  },
});

export const findTreatmentByName = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    searchTerm: v.string(),
  },
  handler: async (ctx, args) => {
    const term = args.searchTerm.toLowerCase();
    const treatments = await ctx.db
      .query("gabinetTreatments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return (
      treatments.find(
        (t) =>
          t.name.toLowerCase().includes(term) ||
          term.includes(t.name.toLowerCase())
      ) ?? null
    );
  },
});

export const findEmployeeByUserId = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();
  },
});

export const createAppointmentFromSync = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    treatmentId: v.optional(v.id("gabinetTreatments")),
    employeeUserId: v.id("users"),
    date: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    requiresCompletion: v.boolean(),
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    meetingUrl: v.optional(v.string()),
    dueDate: v.number(),
    endDateTs: v.number(),
    ownerId: v.id("users"),
    googleEventId: v.string(),
    googleCalendarId: v.string(),
    syncConfigId: v.id("googleCalendarSyncConfigs"),
    visibilityOverride: v.union(
      v.literal("full"),
      v.literal("busy_only"),
      v.literal("hidden")
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing activity by googleEventId (dedup)
    const existing = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_orgAndGoogleEventId", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("googleEventId", args.googleEventId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        description: args.description,
        location: args.location,
        meetingUrl: args.meetingUrl,
        dueDate: args.dueDate,
        endDate: args.endDateTs,
        requiresCompletion: args.requiresCompletion,
        visibilityOverride: args.visibilityOverride,
        lastGoogleSyncAt: now,
        updatedAt: now,
      });
      if (existing.moduleRef?.entityId) {
        await ctx.db.patch(existing.moduleRef.entityId as any, {
          date: args.date,
          startTime: args.startTime,
          endTime: args.endTime,
          requiresCompletion: args.requiresCompletion,
          ...(args.treatmentId ? { treatmentId: args.treatmentId } : {}),
          updatedAt: now,
        });
      }
      return { type: "updated" as const, activityId: existing._id };
    }

    // Create scheduledActivity first (with placeholder moduleRef)
    const activityId = await ctx.db.insert("scheduledActivities", {
      organizationId: args.organizationId,
      title: args.title,
      activityType: "appointment",
      dueDate: args.dueDate,
      endDate: args.endDateTs,
      isCompleted: false,
      ownerId: args.ownerId,
      description: args.description,
      location: args.location,
      meetingUrl: args.meetingUrl,
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

    await ctx.scheduler.runAfter(
      0,
      internal.supabase.scheduledActivities.writeScheduledActivityToSupabase,
      {
        scheduledActivityId: String(activityId),
        organizationId: String(args.organizationId),
        title: args.title,
        activityType: "appointment",
        dueDate: args.dueDate,
        endDate: args.endDateTs,
        isCompleted: false,
        ownerId: String(args.ownerId),
        description: args.description,
        location: args.location,
        meetingUrl: args.meetingUrl,
        googleEventId: args.googleEventId,
        googleCalendarId: args.googleCalendarId,
        lastGoogleSyncAt: now,
        sourceType: "google",
        syncConfigId: String(args.syncConfigId),
        requiresCompletion: args.requiresCompletion,
        visibilityOverride: args.visibilityOverride,
        moduleRef: {
          moduleId: "gabinet",
          entityType: "gabinetAppointment",
          entityId: "",
        },
        createdBy: String(args.ownerId),
        createdAt: now,
        updatedAt: now,
      },
    );

    // Create gabinetAppointment
    const appointmentId = await ctx.db.insert("gabinetAppointments", {
      organizationId: args.organizationId,
      patientId: args.patientId,
      treatmentId: args.treatmentId,
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

    await ctx.scheduler.runAfter(
      0,
      internal.supabase.gabinet.appointments.writeAppointmentToSupabase,
      {
        appointmentId: String(appointmentId),
        organizationId: String(args.organizationId),
        patientId: String(args.patientId),
        treatmentId: args.treatmentId ? String(args.treatmentId) : undefined,
        employeeId: String(args.employeeUserId),
        date: args.date,
        startTime: args.startTime,
        endTime: args.endTime,
        status: "scheduled",
        isRecurring: false,
        scheduledActivityId: String(activityId),
        requiresCompletion: args.requiresCompletion,
        createdBy: String(args.ownerId),
        createdAt: now,
        updatedAt: now,
      },
    );

    // Patch moduleRef with real appointmentId
    await ctx.db.patch(activityId, {
      moduleRef: {
        moduleId: "gabinet",
        entityType: "gabinetAppointment",
        entityId: appointmentId as string,
      },
    });

    return { type: "created" as const, activityId, appointmentId };
  },
});
