import { query, action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";
import { verifyOrgAccess } from "../_helpers/auth";
import { checkPermission } from "../_helpers/permissions";
import { createNotificationDirect } from "../notifications";
import { Id } from "../_generated/dataModel";

const DEFAULT_REMINDER_HOURS = 24;

/**
 * Schedule a reminder for an appointment.
 * Calculates when to send based on appointment time minus configured hours.
 * Side effects (ctx.scheduler, ctx.db writes) delegated to _scheduleReminderSideEffects.
 */
export const scheduleReminder = action({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.string(),
  },
  handler: async (ctx, args) => {
    // Auth via internal query
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    // Read appointment from Supabase
    const appointment = await db.get("gabinetAppointments", args.appointmentId);
    if (!appointment || String(appointment.organizationId) !== String(args.organizationId)) {
      throw new Error("Appointment not found");
    }

    // Get org settings for reminder config
    const orgSettings = await ctx.runQuery(
      internal.gabinet.appointments._getOrgSettings,
      { organizationId: args.organizationId },
    ) as Record<string, unknown> | null;

    const reminderHours = (orgSettings?.reminderHoursBefore as number) ?? DEFAULT_REMINDER_HOURS;

    // Calculate when the reminder should fire
    const appointmentMs = new Date(
      `${appointment.date}T${appointment.startTime}:00`
    ).getTime();
    const reminderMs = appointmentMs - reminderHours * 60 * 60 * 1000;
    const now = Date.now();

    // Don't schedule if reminder time is in the past
    if (reminderMs <= now) {
      return null;
    }

    const delayMs = reminderMs - now;

    // Create reminder record in Supabase
    const reminderId = await db.insert("appointmentReminders", {
      organizationId: String(args.organizationId),
      appointmentId: args.appointmentId,
      type: "notification",
      scheduledFor: reminderMs,
      status: "pending",
      createdAt: now,
    });

    // Delegate scheduler call to internalMutation
    try {
      await ctx.runMutation(
        internal.gabinet.appointmentReminders._scheduleReminderSideEffects,
        {
          reminderId,
          organizationId: args.organizationId,
          appointmentId: args.appointmentId,
          delayMs,
        },
      );
    } catch (e) {
      console.error("[scheduleReminder] Side effects FAILED for reminder", reminderId, ":", e);
    }

    return reminderId;
  },
});

/**
 * Internal: schedule the actual reminder via ctx.scheduler and store the scheduledFunctionId.
 * Also creates a Convex-side reminder record so sendReminder can find it.
 */
export const _scheduleReminderSideEffects = internalMutation({
  args: {
    reminderId: v.string(),
    organizationId: v.id("organizations"),
    appointmentId: v.string(),
    delayMs: v.number(),
  },
  handler: async (ctx, args) => {
    // Schedule the actual send
    const scheduledId = await ctx.scheduler.runAfter(
      args.delayMs,
      internal.gabinet.appointmentReminders.sendReminder,
      { reminderId: args.reminderId },
    );

    // Store scheduled function ID in Supabase so we can cancel if needed
    const db = createSupabaseDb();
    await db.patch("appointmentReminders", args.reminderId, {
      scheduledFunctionId: scheduledId as unknown as string,
    });
  },
});

/**
 * Internal mutation that actually sends the reminder notification.
 * Called by the scheduler at the configured time before the appointment.
 * Reads from Supabase but uses ctx.db for notifications / side effects.
 */
export const sendReminder = internalMutation({
  args: {
    reminderId: v.string(),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    const reminder = await db.get("appointmentReminders", args.reminderId);
    if (!reminder) return;

    // Skip if already sent or cancelled
    if (reminder.status !== "pending") return;

    const appointment = await db.get("gabinetAppointments", String(reminder.appointmentId));
    if (!appointment) {
      await db.patch("appointmentReminders", args.reminderId, { status: "cancelled" });
      return;
    }

    // Skip if appointment was cancelled or completed
    if (
      appointment.status === "cancelled" ||
      appointment.status === "completed" ||
      appointment.status === "no_show"
    ) {
      await db.patch("appointmentReminders", args.reminderId, { status: "cancelled" });
      return;
    }

    const patient = await db.get("gabinetPatients", String(appointment.patientId));
    const treatment = appointment.treatmentId
      ? await db.get("gabinetTreatments", String(appointment.treatmentId))
      : null;
    const patientName = patient
      ? `${patient.firstName} ${patient.lastName ?? ""}`.trim()
      : "Klient";
    const treatmentName = (treatment?.name as string) ?? "Wizyta";

    // Send in-app notification to the employee assigned to the appointment
    await createNotificationDirect(ctx, {
      organizationId: reminder.organizationId as Id<"organizations">,
      userId: appointment.employeeId as Id<"users">,
      type: "appointment_reminder",
      title: "Przypomnienie o wizycie",
      message: `${patientName} — ${treatmentName}, ${appointment.date} o ${appointment.startTime}`,
      link: `/dashboard/gabinet/calendar?date=${appointment.date}`,
    });

    // Also notify the appointment creator if different from employee
    if (appointment.createdBy !== appointment.employeeId) {
      await createNotificationDirect(ctx, {
        organizationId: reminder.organizationId as Id<"organizations">,
        userId: appointment.createdBy as Id<"users">,
        type: "appointment_reminder",
        title: "Przypomnienie o wizycie",
        message: `${patientName} — ${treatmentName}, ${appointment.date} o ${appointment.startTime}`,
        link: `/dashboard/gabinet/calendar?date=${appointment.date}`,
      });
    }

    // Send appointment reminder email if patient has email.
    // Pick the event type that matches the configured lead time so it
    // resolves against the seeded gabinet.appointment.reminder_* bindings.
    if (patient?.email) {
      // appointment.employeeId references users(id), not gabinetEmployees(id),
      // so query the gabinet profile by userId and fall back to the linked user.
      const employeeUserId = String(appointment.employeeId);
      const [employee, employeeUser] = await Promise.all([
        db.query("gabinetEmployees")
          .eq("organizationId", String(reminder.organizationId))
          .eq("userId", employeeUserId)
          .first(),
        db.get("users", employeeUserId).catch(() => null),
      ]);
      const employeeFullName = employee
        ? [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim()
        : "";
      const employeeName =
        (employeeUser?.name as string | undefined) ??
        (employeeFullName.length > 0 ? employeeFullName : undefined) ??
        (employeeUser?.email as string | undefined) ??
        "Specjalista";

      const appointmentMs = new Date(
        `${appointment.date}T${appointment.startTime}:00`,
      ).getTime();
      const reminderHoursAhead = Math.round(
        (appointmentMs - (reminder.scheduledFor as number)) / (60 * 60 * 1000),
      );
      const reminderEventType =
        reminderHoursAhead === 24
          ? "gabinet.appointment.reminder_24h"
          : reminderHoursAhead === 1
            ? "gabinet.appointment.reminder_1h"
            : "gabinet.appointment.reminder_custom";

      await ctx.runMutation(internal.emailEventTrigger.triggerEmailEvent, {
        organizationId: reminder.organizationId as Id<"organizations">,
        eventType: reminderEventType,
        recipientEmail: patient.email as string,
        recipientName: patientName,
        payload: JSON.stringify({
          patientName,
          patientEmail: patient.email as string,
          appointmentDate: appointment.date,
          appointmentTime: appointment.startTime,
          treatmentName,
          employeeName,
        }),
      });
    }

    const reminderPayload = {
      organizationId: String(reminder.organizationId),
      appointmentId: String(appointment._id),
      patientId: String(appointment.patientId),
      treatmentId: String(appointment.treatmentId),
      employeeId: String(appointment.employeeId),
      date: appointment.date as string,
      startTime: appointment.startTime as string,
      patientEmail: patient?.email as string | undefined,
      patientPhone: patient?.phone as string | undefined,
      patientName,
      treatmentName,
    };

    await ctx.runMutation(internal.automation.emitEvent, {
      organizationId: reminder.organizationId as Id<"organizations">,
      module: "gabinet",
      eventType: "gabinet.appointment.reminder_due",
      entityType: "gabinetAppointment",
      entityId: String(appointment._id),
      actorUserId: appointment.createdBy as Id<"users">,
      correlationKey: `appointment:${appointment._id}`,
      eventIdempotencyKey: `automation-event:${reminder.organizationId}:${appointment._id}:reminder:${args.reminderId}`,
      payload: JSON.stringify(reminderPayload),
      occurredAt: Date.now(),
    });

    // Queue appointment confirmation SMS if patient has phone
    if (patient?.phone) {
      await ctx.runMutation(internal.gabinet.appointmentSms.queueConfirmationRequest, {
        organizationId: reminder.organizationId as Id<"organizations">,
        appointmentId: appointment._id as Id<"gabinetAppointments">,
        reminderId: args.reminderId as Id<"appointmentReminders">,
        trigger: "reminder",
      });
    }

    const now = Date.now();
    await db.patch("appointmentReminders", args.reminderId, {
      status: "sent",
      sentAt: now,
    });

    // Mark on the appointment that reminder was sent
    await db.patch("gabinetAppointments", String(appointment._id), {
      reminderSentAt: now,
    });
  },
});

/**
 * Cancel all pending reminders for an appointment.
 * Called when an appointment is cancelled.
 */
export const cancelReminders = action({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.string(),
  },
  handler: async (ctx, args) => {
    // Auth via internal query
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    // Query pending reminders from Supabase
    const reminders = await db.query("appointmentReminders")
      .eq("appointmentId", args.appointmentId)
      .collect();

    let cancelledCount = 0;
    for (const reminder of reminders) {
      if (reminder.status === "pending") {
        // Cancel the scheduled function via internalMutation
        if (reminder.scheduledFunctionId) {
          try {
            await ctx.runMutation(
              internal.gabinet.appointmentReminders._cancelScheduledFunction,
              { scheduledFunctionId: String(reminder.scheduledFunctionId) },
            );
          } catch {
            // Scheduled function may have already fired or been cancelled
          }
        }
        await db.patch("appointmentReminders", String(reminder._id), { status: "cancelled" });
        cancelledCount++;
      }
    }

    return { cancelled: cancelledCount };
  },
});

/**
 * Internal: cancel a scheduled function by ID.
 */
export const _cancelScheduledFunction = internalMutation({
  args: {
    scheduledFunctionId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.cancel(
      args.scheduledFunctionId as unknown as Id<"_scheduled_functions">,
    );
  },
});

/**
 * Internal: schedule a reminder without auth checks.
 * Used by appointment create/update mutations.
 */
export const scheduleReminderInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.string(),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    const appointment = await db.get("gabinetAppointments", args.appointmentId);
    if (!appointment) return null;

    // Get org settings for reminder config
    const orgSettings = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    const reminderHours =
      orgSettings?.reminderHoursBefore ?? DEFAULT_REMINDER_HOURS;

    const appointmentMs = new Date(
      `${appointment.date}T${appointment.startTime}:00`
    ).getTime();
    const reminderMs = appointmentMs - reminderHours * 60 * 60 * 1000;
    const now = Date.now();

    if (reminderMs <= now) return null;

    const delayMs = reminderMs - now;

    const reminderId = await db.insert("appointmentReminders", {
      organizationId: String(args.organizationId),
      appointmentId: args.appointmentId,
      type: "notification",
      scheduledFor: reminderMs,
      status: "pending",
      createdAt: now,
    });

    const scheduledId = await ctx.scheduler.runAfter(
      delayMs,
      internal.gabinet.appointmentReminders.sendReminder,
      { reminderId },
    );

    await db.patch("appointmentReminders", reminderId, {
      scheduledFunctionId: scheduledId as unknown as string,
    });

    return reminderId;
  },
});

/**
 * Internal: cancel pending reminders without auth checks.
 * Used by appointment cancel mutations.
 */
export const cancelRemindersInternal = internalMutation({
  args: {
    appointmentId: v.string(),
  },
  handler: async (ctx, args) => {
    // appointmentReminders is a Convex-only table; read + patch via ctx.db.
    const reminders = await ctx.db
      .query("appointmentReminders")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", args.appointmentId))
      .collect();

    for (const reminder of reminders) {
      if (reminder.status === "pending") {
        if (reminder.scheduledFunctionId) {
          try {
            await ctx.scheduler.cancel(
              reminder.scheduledFunctionId as unknown as Id<"_scheduled_functions">,
            );
          } catch {
            // Already fired or cancelled
          }
        }
        await ctx.db.patch(reminder._id, { status: "cancelled" });
      }
    }
  },
});

/**
 * List reminders for an appointment (for UI display).
 */
export const listByAppointment = query({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(
      ctx,
      args.organizationId,
      "gabinet_appointments",
      "view"
    );
    if (!perm.allowed) throw new Error("Permission denied");

    return await ctx.db
      .query("appointmentReminders")
      .withIndex("by_appointment", (q) =>
        q.eq("appointmentId", args.appointmentId)
      )
      .collect();
  },
});
