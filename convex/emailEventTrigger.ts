import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * Internal email event trigger.
 *
 * Call this from Convex mutations (appointments, documents, CRM) to fire
 * an email event without requiring public API authentication.
 *
 * The trigger inserts a pending log entry and schedules async processing.
 * The scheduler resolves bindings → template → sends via Resend.
 *
 * @example
 * // Inside an appointment mutation:
 * await ctx.runMutation(internal.emailEventTrigger.triggerEmailEvent, {
 *   organizationId: args.organizationId,
 *   eventType: "appointment.created",
 *   recipientEmail: patient.email,
 *   recipientName: `${patient.firstName} ${patient.lastName}`,
 *   payload: JSON.stringify({
 *     patientName: `${patient.firstName} ${patient.lastName}`,
 *     appointmentDate: appointment.date,
 *     appointmentTime: appointment.startTime,
 *     treatmentName: treatment.name,
 *     employeeName: employeeName,
 *   }),
 *   triggeredBy: userId,
 * });
 */
export const triggerEmailEvent = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    /** Event type key, e.g. "appointment.created", "lead.status_changed" */
    eventType: v.string(),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    /**
     * JSON string: flat Record<string, string> matching the event's payloadSchema.
     * Variables are substituted into email template placeholders via {{key}}.
     */
    payload: v.optional(v.string()),
    triggeredBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const logId = await ctx.db.insert("emailEventLog", {
      organizationId: args.organizationId,
      eventType: args.eventType,
      status: "pending",
      payload: args.payload,
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      triggeredBy: args.triggeredBy,
      createdAt: Date.now(),
    });

    // Schedule async processing — non-blocking, so the calling mutation
    // doesn't wait for email delivery.
    await ctx.scheduler.runAfter(0, internal.emailEvents.processEvent, {
      logId,
    });

    // Enroll in any active sequences triggered by this event type.
    // Silent no-op if no sequences match.
    const sequences = await ctx.db
      .query("emailSequences")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    for (const sequence of sequences) {
      if (sequence.isActive && sequence.triggerEventType === args.eventType) {
        await ctx.scheduler.runAfter(
          0,
          internal.emailSequences.enrollRecipient,
          {
            sequenceId: sequence._id,
            organizationId: args.organizationId,
            recipientEmail: args.recipientEmail,
            recipientName: args.recipientName,
            payload: args.payload,
          },
        );
      }
    }

    return logId;
  },
});
