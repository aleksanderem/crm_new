import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";

/**
 * Internal email event trigger.
 *
 * Call this from Convex actions (or schedule from mutations) to fire
 * an email event without requiring public API authentication.
 *
 * The trigger inserts a pending log entry directly to Supabase and schedules
 * async processing. The scheduler resolves bindings → template → sends via Resend.
 *
 * @example
 * // Inside an action, or scheduled from a mutation:
 * await ctx.scheduler.runAfter(0, internal.emailEventTrigger.triggerEmailEvent, {
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
export const triggerEmailEvent = internalAction({
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
    const db = createSupabaseDb();

    if (args.idempotencyKey) {
      const existing = await db
        .query("emailEventLog")
        .eq("organizationId", String(args.organizationId))
        .eq("idempotencyKey", args.idempotencyKey)
        .unique();
      if (existing) {
        return existing._id as string;
      }
    }

    const logId = await db.insert("emailEventLog", {
      organizationId: String(args.organizationId),
      eventType: args.eventType,
      status: "pending",
      payload: args.payload ?? null,
      source: args.source ?? null,
      relatedEntityType: args.relatedEntityType ?? null,
      relatedEntityId: args.relatedEntityId ?? null,
      idempotencyKey: args.idempotencyKey ?? null,
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName ?? null,
      triggeredBy: args.triggeredBy ? String(args.triggeredBy) : null,
      createdAt: Date.now(),
    });

    // Schedule async processing — non-blocking, so the calling action
    // doesn't wait for email delivery.
    await ctx.scheduler.runAfter(0, internal.emailEvents.processEvent, {
      logId,
    });

    // Enroll in any active sequences triggered by this event type.
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
