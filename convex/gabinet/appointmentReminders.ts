import { query, mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { verifyOrgAccess } from "../_helpers/auth";
import { checkPermission } from "../_helpers/permissions";
import { verifyProductAccess } from "../_helpers/products";
import { createNotificationDirect } from "../notifications";
import { GABINET_PRODUCT_ID } from "./_registry";
import { Id } from "../_generated/dataModel";

const DEFAULT_REMINDER_HOURS = 24;

/**
 * Schedule a reminder for an appointment.
 * Calculates when to send based on appointment time minus configured hours.
 * Uses ctx.scheduler.runAfter() to fire the sendReminder at the right time.
 */
export const scheduleReminder = mutation({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.id("gabinetAppointments"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);

    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment || appointment.organizationId !== args.organizationId) {
      throw new Error("Appointment not found");
    }

    // Get org settings for reminder config
    const orgSettings = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    const reminderHours = orgSettings?.reminderHoursBefore ?? DEFAULT_REMINDER_HOURS;

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

    // Create reminder record
    const reminderId = await ctx.db.insert("appointmentReminders", {
      organizationId: args.organizationId,
      appointmentId: args.appointmentId,
      type: "notification",
      scheduledFor: reminderMs,
      status: "pending",
      createdAt: now,
    });

    // Schedule the actual send
    const scheduledId = await ctx.scheduler.runAfter(
      delayMs,
      internal.gabinet.appointmentReminders.sendReminder,
      { reminderId }
    );

    // Store scheduled function ID so we can cancel if needed
    await ctx.db.patch(reminderId, {
      scheduledFunctionId: scheduledId as unknown as string,
    });

    return reminderId;
  },
});

/**
 * Internal mutation that actually sends the reminder notification.
 * Called by the scheduler at the configured time before the appointment.
 */
export const sendReminder = internalMutation({
  args: {
    reminderId: v.id("appointmentReminders"),
  },
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.reminderId);
    if (!reminder) return;

    // Skip if already sent or cancelled
    if (reminder.status !== "pending") return;

    const appointment = await ctx.db.get(reminder.appointmentId);
    if (!appointment) {
      await ctx.db.patch(args.reminderId, { status: "cancelled" });
      return;
    }

    // Skip if appointment was cancelled or completed
    if (
      appointment.status === "cancelled" ||
      appointment.status === "completed" ||
      appointment.status === "no_show"
    ) {
      await ctx.db.patch(args.reminderId, { status: "cancelled" });
      return;
    }

    const patient = await ctx.db.get(appointment.patientId);
    const treatment = await ctx.db.get(appointment.treatmentId);
    const patientName = patient
      ? `${patient.firstName} ${patient.lastName ?? ""}`.trim()
      : "Pacjent";
    const treatmentName = treatment?.name ?? "Wizyta";

    // Send in-app notification to the employee assigned to the appointment
    await createNotificationDirect(ctx, {
      organizationId: reminder.organizationId,
      userId: appointment.employeeId,
      type: "appointment_reminder",
      title: "Przypomnienie o wizycie",
      message: `${patientName} — ${treatmentName}, ${appointment.date} o ${appointment.startTime}`,
      link: `/dashboard/gabinet/calendar?date=${appointment.date}`,
    });

    // Also notify the appointment creator if different from employee
    if (appointment.createdBy !== appointment.employeeId) {
      await createNotificationDirect(ctx, {
        organizationId: reminder.organizationId,
        userId: appointment.createdBy,
        type: "appointment_reminder",
        title: "Przypomnienie o wizycie",
        message: `${patientName} — ${treatmentName}, ${appointment.date} o ${appointment.startTime}`,
        link: `/dashboard/gabinet/calendar?date=${appointment.date}`,
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.reminderId, {
      status: "sent",
      sentAt: now,
    });

    // Mark on the appointment that reminder was sent
    await ctx.db.patch(appointment._id, {
      reminderSentAt: now,
    });
  },
});

/**
 * Cancel all pending reminders for an appointment.
 * Called when an appointment is cancelled.
 */
export const cancelReminders = mutation({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.id("gabinetAppointments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const reminders = await ctx.db
      .query("appointmentReminders")
      .withIndex("by_appointment", (q) =>
        q.eq("appointmentId", args.appointmentId)
      )
      .collect();

    let cancelledCount = 0;
    for (const reminder of reminders) {
      if (reminder.status === "pending") {
        // Cancel the scheduled function if we have its ID
        if (reminder.scheduledFunctionId) {
          try {
            await ctx.scheduler.cancel(
              reminder.scheduledFunctionId as unknown as Id<"_scheduled_functions">
            );
          } catch {
            // Scheduled function may have already fired or been cancelled
          }
        }
        await ctx.db.patch(reminder._id, { status: "cancelled" });
        cancelledCount++;
      }
    }

    return { cancelled: cancelledCount };
  },
});

/**
 * Internal: schedule a reminder without auth checks.
 * Used by appointment create/update mutations.
 */
export const scheduleReminderInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.id("gabinetAppointments"),
  },
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get(args.appointmentId);
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

    const reminderId = await ctx.db.insert("appointmentReminders", {
      organizationId: args.organizationId,
      appointmentId: args.appointmentId,
      type: "notification",
      scheduledFor: reminderMs,
      status: "pending",
      createdAt: now,
    });

    const scheduledId = await ctx.scheduler.runAfter(
      delayMs,
      internal.gabinet.appointmentReminders.sendReminder,
      { reminderId }
    );

    await ctx.db.patch(reminderId, {
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
    appointmentId: v.id("gabinetAppointments"),
  },
  handler: async (ctx, args) => {
    const reminders = await ctx.db
      .query("appointmentReminders")
      .withIndex("by_appointment", (q) =>
        q.eq("appointmentId", args.appointmentId)
      )
      .collect();

    for (const reminder of reminders) {
      if (reminder.status === "pending") {
        if (reminder.scheduledFunctionId) {
          try {
            await ctx.scheduler.cancel(
              reminder.scheduledFunctionId as unknown as Id<"_scheduled_functions">
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
    appointmentId: v.id("gabinetAppointments"),
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
