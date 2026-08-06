import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeEventLogRef = internal.supabase.emailEventLog.writeEmailEventLogToSupabase;

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
    source: v.optional(v.string()),
    relatedEntityType: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    triggeredBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("emailEventLog")
        .withIndex("by_orgAndIdempotency", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("idempotencyKey", args.idempotencyKey),
        )
        .unique();
      if (existing) {
        return existing._id;
      }
    }

    const logId = await ctx.db.insert("emailEventLog", {
      organizationId: args.organizationId,
      eventType: args.eventType,
      status: "pending",
      payload: args.payload,
      source: args.source,
      relatedEntityType: args.relatedEntityType,
      relatedEntityId: args.relatedEntityId,
      idempotencyKey: args.idempotencyKey,
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      triggeredBy: args.triggeredBy,
      createdAt: Date.now(),
    });

    // Sync to Supabase
    await ctx.scheduler.runAfter(0, writeEventLogRef, {
      emailEventLogId: logId as string,
      organizationId: args.organizationId as string,
      eventType: args.eventType,
      status: "pending",
      payload: args.payload,
      source: args.source,
      relatedEntityType: args.relatedEntityType,
      relatedEntityId: args.relatedEntityId,
      idempotencyKey: args.idempotencyKey,
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      triggeredBy: args.triggeredBy as string | undefined,
      createdAt: Date.now(),
    });

    // Schedule async processing — non-blocking, so the calling mutation
    // doesn't wait for email delivery.
    await ctx.scheduler.runAfter(0, internal.emailEvents.processEvent, {
      logId,
    });

    // Enroll in any active sequences triggered by this event type.
    // Delegated to an action so the HTTP call to Supabase is allowed.
    // Silent no-op if no sequences match.
    await ctx.scheduler.runAfter(0, internal.emailSequences.enrollForEvent, {
      organizationId: args.organizationId,
      eventType: args.eventType,
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      payload: args.payload,
    });

    return logId;
  },
});
