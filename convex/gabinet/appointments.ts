import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "../_helpers/auth";
import { checkPermission } from "../_helpers/permissions";
import { verifyProductAccess } from "../_helpers/products";
import { logActivity } from "../_helpers/activities";
import { GABINET_PRODUCT_ID } from "./_registry";
import { gabinetAppointmentStatusValidator } from "../schema";
import { checkConflict, getAvailableSlots, checkEmployeeQualification } from "./_availability";
import { Id } from "../_generated/dataModel";
import { logAudit } from "../auditLog";
import { createNotificationDirect } from "../notifications";

const VALID_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["confirmed", "cancelled", "no_show"],
  confirmed: ["in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

function generateRecurringDates(
  startDate: string,
  rule: { frequency: string; count?: number; until?: string }
): string[] {
  const dates: string[] = [];
  const d = new Date(startDate + "T00:00:00");
  const max = rule.count ?? 52;
  const untilDate = rule.until ? new Date(rule.until + "T23:59:59") : null;

  for (let i = 1; i < max; i++) {
    switch (rule.frequency) {
      case "daily": d.setDate(d.getDate() + 1); break;
      case "weekly": d.setDate(d.getDate() + 7); break;
      case "biweekly": d.setDate(d.getDate() + 14); break;
      case "monthly": d.setMonth(d.getMonth() + 1); break;
      default: return dates;
    }
    if (untilDate && d > untilDate) break;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
  }
  return dates;
}

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_appointments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const result = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
    if (perm.scope === "own") {
      return { ...result, page: result.page.filter((r) => r.createdBy === user._id) };
    }
    return result;
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.id("gabinetAppointments"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_appointments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const appt = await ctx.db.get(args.appointmentId);
    if (!appt || appt.organizationId !== args.organizationId) {
      throw new Error("Appointment not found");
    }
    if (perm.scope === "own" && appt.createdBy !== user._id) {
      throw new Error("Permission denied: you can only view your own records");
    }
    return appt;
  },
});

export const listByDate = query({
  args: {
    organizationId: v.id("organizations"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_appointments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const results = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndDate", (q) =>
        q.eq("organizationId", args.organizationId).eq("date", args.date)
      )
      .collect();
    if (perm.scope === "own") {
      return results.filter((r) => r.createdBy === user._id);
    }
    return results;
  },
});

export const listByDateRange = query({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.string(),
    endDate: v.string(),
    employeeId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_appointments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    let results;
    if (args.employeeId) {
      results = await ctx.db
        .query("gabinetAppointments")
        .withIndex("by_orgAndEmployeeAndDate", (q) =>
          q.eq("organizationId", args.organizationId)
            .eq("employeeId", args.employeeId!)
            .gte("date", args.startDate)
            .lte("date", args.endDate)
        )
        .collect();
    } else {
      results = await ctx.db
        .query("gabinetAppointments")
        .withIndex("by_orgAndDate", (q) =>
          q.eq("organizationId", args.organizationId)
            .gte("date", args.startDate)
            .lte("date", args.endDate)
        )
        .collect();
    }
    if (perm.scope === "own") {
      return results.filter((r) => r.createdBy === user._id);
    }
    return results;
  },
});

export const listByPatient = query({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_appointments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const results = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndPatient", (q) =>
        q.eq("organizationId", args.organizationId).eq("patientId", args.patientId)
      )
      .collect();
    if (perm.scope === "own") {
      return results.filter((r) => r.createdBy === user._id);
    }
    return results;
  },
});

export const listByEmployee = query({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_appointments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const results = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndEmployee", (q) =>
        q.eq("organizationId", args.organizationId).eq("employeeId", args.employeeId)
      )
      .collect();
    if (perm.scope === "own") {
      return results.filter((r) => r.createdBy === user._id);
    }
    return results;
  },
});

export const listPatientsForEmployee = query({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_appointments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    let appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndEmployee", (q) =>
        q.eq("organizationId", args.organizationId).eq("employeeId", args.employeeId)
      )
      .collect();
    if (perm.scope === "own") {
      appointments = appointments.filter((r) => r.createdBy === user._id);
    }

    const uniquePatientIds = [...new Set(appointments.map((a) => a.patientId))];
    const patients = await Promise.all(
      uniquePatientIds.map((pid) => ctx.db.get(pid))
    );
    return patients.filter(Boolean);
  },
});

export const getAvailableSlotsQuery = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    date: v.string(),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_appointments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    return await getAvailableSlots(ctx, args);
  },
});

export const checkQualification = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    treatmentId: v.id("gabinetTreatments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_appointments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    return await checkEmployeeQualification(ctx, args);
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    treatmentId: v.id("gabinetTreatments"),
    employeeId: v.id("users"),
    date: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    notes: v.optional(v.string()),
    internalNotes: v.optional(v.string()),
    color: v.optional(v.string()),
    isRecurring: v.optional(v.boolean()),
    recurringRule: v.optional(v.object({
      frequency: v.string(),
      count: v.optional(v.number()),
      until: v.optional(v.string()),
    })),
    prepaymentRequired: v.optional(v.boolean()),
    prepaymentAmount: v.optional(v.number()),
    packageUsageId: v.optional(v.id("gabinetPackageUsage")),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_appointments", "create");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();

    // Check employee qualification for treatment
    const qualification = await checkEmployeeQualification(ctx, {
      organizationId: args.organizationId,
      userId: args.employeeId,
      treatmentId: args.treatmentId,
    });
    if (!qualification.qualified) {
      throw new Error(qualification.reason ?? "Employee not qualified");
    }

    // Check conflict
    const conflict = await checkConflict(ctx, {
      organizationId: args.organizationId,
      userId: args.employeeId,
      date: args.date,
      startTime: args.startTime,
      endTime: args.endTime,
    });
    if (conflict.hasConflict) {
      throw new Error(conflict.reason ?? "Time slot conflict");
    }

    const isRecurring = args.isRecurring ?? false;
    const recurringGroupId = isRecurring ? crypto.randomUUID() : undefined;

    const baseData = {
      organizationId: args.organizationId,
      patientId: args.patientId,
      treatmentId: args.treatmentId,
      employeeId: args.employeeId,
      startTime: args.startTime,
      endTime: args.endTime,
      status: "scheduled" as const,
      notes: args.notes,
      internalNotes: args.internalNotes,
      color: args.color,
      isRecurring,
      recurringRule: args.recurringRule,
      recurringGroupId,
      prepaymentRequired: args.prepaymentRequired,
      prepaymentAmount: args.prepaymentAmount,
      prepaymentStatus: args.prepaymentRequired ? "pending" : undefined,
      packageUsageId: args.packageUsageId,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    };

    // Resolve treatment + patient for calendar event title
    const treatment = await ctx.db.get(args.treatmentId);
    const patient = await ctx.db.get(args.patientId);
    const patientName = patient
      ? `${patient.firstName}${patient.lastName ? " " + patient.lastName : ""}`
      : "Patient";
    const treatmentName = treatment?.name ?? "Treatment";

    // Create first appointment
    const firstId = await ctx.db.insert("gabinetAppointments", {
      ...baseData,
      date: args.date,
      recurringIndex: isRecurring ? 0 : undefined,
    });

    // Dual write: create shared calendar event
    const dueDateMs = new Date(`${args.date}T${args.startTime}:00`).getTime();
    const endDateMs = new Date(`${args.date}T${args.endTime}:00`).getTime();

    const scheduledActivityId = await ctx.db.insert("scheduledActivities", {
      organizationId: args.organizationId,
      title: `${treatmentName} — ${patientName}`,
      activityType: "gabinet:appointment",
      dueDate: dueDateMs,
      endDate: endDateMs,
      isCompleted: false,
      ownerId: user._id,
      description: args.notes,
      linkedEntityType: "gabinetAppointment",
      linkedEntityId: firstId,
      moduleRef: {
        moduleId: "gabinet",
        entityType: "gabinetAppointment",
        entityId: firstId,
      },
      resourceId: args.employeeId,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(firstId, { scheduledActivityId });

    // Generate recurring series
    if (isRecurring && args.recurringRule) {
      const dates = generateRecurringDates(args.date, args.recurringRule);
      for (let i = 0; i < dates.length; i++) {
        const recurId = await ctx.db.insert("gabinetAppointments", {
          ...baseData,
          date: dates[i],
          recurringIndex: i + 1,
        });

        const recurDueMs = new Date(`${dates[i]}T${args.startTime}:00`).getTime();
        const recurEndMs = new Date(`${dates[i]}T${args.endTime}:00`).getTime();

        const recurActivityId = await ctx.db.insert("scheduledActivities", {
          organizationId: args.organizationId,
          title: `${treatmentName} — ${patientName}`,
          activityType: "gabinet:appointment",
          dueDate: recurDueMs,
          endDate: recurEndMs,
          isCompleted: false,
          ownerId: user._id,
          description: args.notes,
          linkedEntityType: "gabinetAppointment",
          linkedEntityId: recurId,
          moduleRef: {
            moduleId: "gabinet",
            entityType: "gabinetAppointment",
            entityId: recurId,
          },
          resourceId: args.employeeId,
          createdBy: user._id,
          createdAt: now,
          updatedAt: now,
        });

        await ctx.db.patch(recurId, { scheduledActivityId: recurActivityId });
      }
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetAppointment",
      entityId: firstId,
      action: "created",
      description: `Created appointment for ${args.date} at ${args.startTime}`,
      performedBy: user._id,
    });

    return firstId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.id("gabinetAppointments"),
    date: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    notes: v.optional(v.string()),
    internalNotes: v.optional(v.string()),
    color: v.optional(v.string()),
    employeeId: v.optional(v.id("users")),
    treatmentId: v.optional(v.id("gabinetTreatments")),
    packageUsageId: v.optional(v.id("gabinetPackageUsage")),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_appointments", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const appt = await ctx.db.get(args.appointmentId);
    if (!appt || appt.organizationId !== args.organizationId) {
      throw new Error("Appointment not found");
    }
    if (perm.scope === "own" && appt.createdBy !== user._id) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    // Check conflict if time changed
    const newDate = args.date ?? appt.date;
    const newStart = args.startTime ?? appt.startTime;
    const newEnd = args.endTime ?? appt.endTime;
    const newEmployee = args.employeeId ?? appt.employeeId;

    if (args.date || args.startTime || args.endTime || args.employeeId) {
      const conflict = await checkConflict(ctx, {
        organizationId: args.organizationId,
        userId: newEmployee,
        date: newDate,
        startTime: newStart,
        endTime: newEnd,
        excludeAppointmentId: args.appointmentId,
      });
      if (conflict.hasConflict) {
        throw new Error(conflict.reason ?? "Time slot conflict");
      }
    }

    const { organizationId, appointmentId, ...updates } = args;
    await ctx.db.patch(appointmentId, { ...updates, updatedAt: Date.now() });

    // Sync time/date changes to scheduledActivity
    if (appt.scheduledActivityId && (args.date || args.startTime || args.endTime)) {
      const syncDate = args.date ?? appt.date;
      const syncStart = args.startTime ?? appt.startTime;
      const syncEnd = args.endTime ?? appt.endTime;
      await ctx.db.patch(appt.scheduledActivityId, {
        dueDate: new Date(`${syncDate}T${syncStart}:00`).getTime(),
        endDate: new Date(`${syncDate}T${syncEnd}:00`).getTime(),
        updatedAt: Date.now(),
      });
    }

    // Sync resource change to scheduledActivity
    if (appt.scheduledActivityId && args.employeeId) {
      await ctx.db.patch(appt.scheduledActivityId, {
        resourceId: args.employeeId,
        updatedAt: Date.now(),
      });
    }

    await logActivity(ctx, {
      organizationId,
      entityType: "gabinetAppointment",
      entityId: appointmentId,
      action: "updated",
      description: `Updated appointment`,
      performedBy: user._id,
    });

    return appointmentId;
  },
});

export const updateStatus = mutation({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.id("gabinetAppointments"),
    status: gabinetAppointmentStatusValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_appointments", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const appt = await ctx.db.get(args.appointmentId);
    if (!appt || appt.organizationId !== args.organizationId) {
      throw new Error("Appointment not found");
    }
    if (perm.scope === "own" && appt.createdBy !== user._id) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const allowed = VALID_TRANSITIONS[appt.status];
    if (!allowed?.includes(args.status)) {
      throw new Error(`Cannot transition from ${appt.status} to ${args.status}`);
    }

    const patch: Record<string, unknown> = {
      status: args.status,
      updatedAt: Date.now(),
    };

    if (args.status === "cancelled") {
      patch.cancelledAt = Date.now();
      patch.cancelledBy = user._id;
    }

    await ctx.db.patch(args.appointmentId, patch);

    // Sync to scheduledActivity
    if (appt.scheduledActivityId) {
      const activityPatch: Record<string, unknown> = { updatedAt: Date.now() };
      if (args.status === "completed" || args.status === "cancelled" || args.status === "no_show") {
        activityPatch.isCompleted = true;
        activityPatch.completedAt = Date.now();
      }
      await ctx.db.patch(appt.scheduledActivityId, activityPatch);
    }

    // On completion: award loyalty points + deduct package usage
    if (args.status === "completed") {
      await handleAppointmentCompletion(ctx, {
        organizationId: args.organizationId,
        appointmentId: args.appointmentId,
        patientId: appt.patientId,
        treatmentId: appt.treatmentId,
        packageUsageId: appt.packageUsageId as Id<"gabinetPackageUsage"> | undefined,
        userId: user._id,
      });
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetAppointment",
      entityId: args.appointmentId,
      action: "status_changed",
      description: `Status changed from ${appt.status} to ${args.status}`,
      performedBy: user._id,
    });

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: user._id,
      action: "status_changed",
      entityType: "gabinetAppointment",
      entityId: args.appointmentId,
      details: JSON.stringify({ oldStatus: appt.status, newStatus: args.status }),
    });

    // Notify appointment creator and employee about status change
    if (appt.createdBy !== user._id) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: appt.createdBy,
        type: "appointment_status_changed",
        title: "Appointment status changed",
        message: `Appointment status changed to "${args.status}"`,
      });
    }
    if (appt.employeeId !== user._id && appt.employeeId !== appt.createdBy) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: appt.employeeId,
        type: "appointment_status_changed",
        title: "Appointment status changed",
        message: `Appointment status changed to "${args.status}"`,
      });
    }

    return args.appointmentId;
  },
});

export const cancel = mutation({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.id("gabinetAppointments"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_appointments", "delete");
    if (!perm.allowed) throw new Error("Permission denied");

    const appt = await ctx.db.get(args.appointmentId);
    if (!appt || appt.organizationId !== args.organizationId) {
      throw new Error("Appointment not found");
    }
    if (perm.scope === "own" && appt.createdBy !== user._id) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    if (appt.status === "cancelled" || appt.status === "completed") {
      throw new Error(`Cannot cancel a ${appt.status} appointment`);
    }

    await ctx.db.patch(args.appointmentId, {
      status: "cancelled",
      cancelledAt: Date.now(),
      cancelledBy: user._id,
      cancellationReason: args.reason,
      updatedAt: Date.now(),
    });

    // Sync cancellation to scheduledActivity
    if (appt.scheduledActivityId) {
      await ctx.db.patch(appt.scheduledActivityId, {
        isCompleted: true,
        completedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetAppointment",
      entityId: args.appointmentId,
      action: "status_changed",
      description: `Cancelled appointment${args.reason ? `: ${args.reason}` : ""}`,
      performedBy: user._id,
    });

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: user._id,
      action: "entity_cancelled",
      entityType: "gabinetAppointment",
      entityId: args.appointmentId,
    });

    // Notify appointment creator and employee about cancellation
    if (appt.createdBy !== user._id) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: appt.createdBy,
        type: "appointment_status_changed",
        title: "Appointment cancelled",
        message: `An appointment has been cancelled${args.reason ? `: ${args.reason}` : ""}`,
      });
    }
    if (appt.employeeId !== user._id && appt.employeeId !== appt.createdBy) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: appt.employeeId,
        type: "appointment_status_changed",
        title: "Appointment cancelled",
        message: `An appointment has been cancelled${args.reason ? `: ${args.reason}` : ""}`,
      });
    }
  },
});

/**
 * When an appointment is completed, award loyalty points based on
 * treatment price and deduct from linked package if applicable.
 */
async function handleAppointmentCompletion(
  ctx: any,
  args: {
    organizationId: Id<"organizations">;
    appointmentId: Id<"gabinetAppointments">;
    patientId: Id<"gabinetPatients">;
    treatmentId: Id<"gabinetTreatments">;
    packageUsageId?: Id<"gabinetPackageUsage">;
    userId: Id<"users">;
  }
) {
  const now = Date.now();
  const treatment = await ctx.db.get(args.treatmentId);

  // 1. Deduct from package if linked
  if (args.packageUsageId) {
    const usage = await ctx.db.get(args.packageUsageId);
    if (usage && usage.status === "active") {
      const entry = usage.treatmentsUsed.find(
        (t: any) => t.treatmentId === args.treatmentId
      );
      if (entry && entry.usedCount < entry.totalCount) {
        const updatedTreatments = usage.treatmentsUsed.map((t: any) =>
          t.treatmentId === args.treatmentId
            ? { ...t, usedCount: t.usedCount + 1 }
            : t
        );
        const allUsed = updatedTreatments.every(
          (t: any) => t.usedCount >= t.totalCount
        );
        await ctx.db.patch(args.packageUsageId, {
          treatmentsUsed: updatedTreatments,
          status: allUsed ? "completed" : "active",
          updatedAt: now,
        });
      }
    }
  }

  // 2. Award loyalty points (1 point per PLN of treatment price)
  if (treatment && treatment.price > 0) {
    const points = Math.floor(treatment.price);
    if (points > 0) {
      const loyalty = await ctx.db
        .query("gabinetLoyaltyPoints")
        .withIndex("by_orgAndPatient", (q: any) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("patientId", args.patientId)
        )
        .first();

      const newBalance = (loyalty?.balance ?? 0) + points;
      const newLifetimeEarned = (loyalty?.lifetimeEarned ?? 0) + points;

      if (loyalty) {
        await ctx.db.patch(loyalty._id, {
          balance: newBalance,
          lifetimeEarned: newLifetimeEarned,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("gabinetLoyaltyPoints", {
          organizationId: args.organizationId,
          patientId: args.patientId,
          balance: newBalance,
          lifetimeEarned: newLifetimeEarned,
          lifetimeSpent: 0,
          createdAt: now,
          updatedAt: now,
        });
      }

      await ctx.db.insert("gabinetLoyaltyTransactions", {
        organizationId: args.organizationId,
        patientId: args.patientId,
        type: "earn",
        points,
        reason: `Appointment completed: ${treatment.name}`,
        referenceType: "appointment",
        referenceId: args.appointmentId,
        balanceAfter: newBalance,
        createdBy: args.userId,
        createdAt: now,
      });
    }
  }

  // 3. Create pending payment (if not covered by package)
  if (!args.packageUsageId && treatment && treatment.price > 0) {
    await ctx.db.insert("payments", {
      organizationId: args.organizationId,
      patientId: args.patientId,
      appointmentId: args.appointmentId,
      amount: treatment.price,
      currency: "PLN",
      paymentMethod: "cash",
      status: "pending",
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export const cancelRecurringSeries = mutation({
  args: {
    organizationId: v.id("organizations"),
    recurringGroupId: v.string(),
    fromDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_appointments", "delete");
    if (!perm.allowed) throw new Error("Permission denied");

    const appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndRecurringGroup", (q) =>
        q.eq("organizationId", args.organizationId).eq("recurringGroupId", args.recurringGroupId)
      )
      .collect();

    const now = Date.now();
    let count = 0;
    for (const appt of appointments) {
      if (appt.status === "cancelled" || appt.status === "completed") continue;
      if (args.fromDate && appt.date < args.fromDate) continue;

      await ctx.db.patch(appt._id, {
        status: "cancelled",
        cancelledAt: now,
        cancelledBy: user._id,
        cancellationReason: "Series cancelled",
        updatedAt: now,
      });
      count++;
    }

    return { cancelled: count };
  },
});
