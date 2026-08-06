import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";

// Dual-write refs removed — Supabase is now primary for event writes

const moduleValidator = v.union(
  v.literal("crm"),
  v.literal("gabinet"),
  v.literal("platform"),
);

// ---------------------------------------------------------------------------
// Actions (Supabase-primary)
// ---------------------------------------------------------------------------

export const registerEventType = action({
  args: {
    organizationId: v.id("organizations"),
    eventType: v.string(),
    module: moduleValidator,
    displayName: v.string(),
    description: v.optional(v.string()),
    payloadSchema: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const now = Date.now();

    // Idempotent: update displayName/description if event type already exists for this org
    const existing = await db.query("emailEventTypes")
      .eq("organizationId", String(args.organizationId))
      .eq("eventType", args.eventType)
      .first();

    if (existing) {
      await db.patch("emailEventTypes", existing._id as string, {
        displayName: args.displayName,
        description: args.description ?? null,
        payloadSchema: args.payloadSchema ?? null,
        updatedAt: now,
      });
      return existing._id as string;
    }

    const newId = await db.insert("emailEventTypes", {
      organizationId: String(args.organizationId),
      eventType: args.eventType,
      module: args.module,
      displayName: args.displayName,
      description: args.description ?? null,
      payloadSchema: args.payloadSchema ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    return newId;
  },
});

/**
 * Emit an email event. Creates a log entry and schedules async processing.
 * Callers (CRM mutations, Gabinet mutations) call this without knowing about email.
 */
export const emitEvent = action({
  args: {
    organizationId: v.id("organizations"),
    eventType: v.string(),
    payload: v.optional(v.string()), // JSON string
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    triggeredBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const now = Date.now();

    const logId = await db.insert("emailEventLog", {
      organizationId: String(args.organizationId),
      eventType: args.eventType,
      status: "pending",
      payload: args.payload ?? null,
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName ?? null,
      triggeredBy: args.triggeredBy ?? null,
      createdAt: now,
    });

    // Schedule async processing via internalMutation to bridge back to Convex
    try {
      await ctx.runMutation(internal.emailEvents._scheduleProcessing, {
        logId,
        organizationId: args.organizationId,
        eventType: args.eventType,
        payload: args.payload,
        recipientEmail: args.recipientEmail,
        recipientName: args.recipientName,
        triggeredBy: args.triggeredBy,
        createdAt: now,
      });
    } catch (e) {
      console.error("[emailEvents.emitEvent] Schedule processing FAILED:", e);
    }

    return logId;
  },
});

/**
 * Internal mutation to insert the log entry into Convex and schedule processing.
 * This bridges the action-based emitEvent back to Convex's scheduler.
 */
export const _scheduleProcessing = internalMutation({
  args: {
    logId: v.string(),
    organizationId: v.id("organizations"),
    eventType: v.string(),
    payload: v.optional(v.string()),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    triggeredBy: v.optional(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Insert a Convex-side log entry so processEvent can read it
    const convexLogId = await ctx.db.insert("emailEventLog", {
      organizationId: args.organizationId,
      eventType: args.eventType,
      status: "pending",
      payload: args.payload,
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      triggeredBy: args.triggeredBy ? args.triggeredBy as any : undefined,
      createdAt: args.createdAt,
    });

    // Schedule async processing — non-blocking
    await ctx.scheduler.runAfter(0, internal.emailEvents.processEvent, {
      logId: convexLogId,
    });
  },
});

// ---------------------------------------------------------------------------
// Internal queries / mutations (used by processEvent action)
// ---------------------------------------------------------------------------

export const getLogEntry = internalQuery({
  args: { logId: v.id("emailEventLog") },
  handler: async (ctx, args) => ctx.db.get(args.logId),
});

export const updateLogStatus = internalMutation({
  args: {
    logId: v.id("emailEventLog"),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    bindingId: v.optional(v.string()),
    templateId: v.optional(v.string()),
    renderedSubject: v.optional(v.string()),
    renderedBody: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const processedAt = Date.now();
    await ctx.db.patch(args.logId, {
      status: args.status,
      bindingId: args.bindingId,
      templateId: args.templateId,
      renderedSubject: args.renderedSubject,
      renderedBody: args.renderedBody,
      errorMessage: args.errorMessage,
      processedAt,
    });

    const entry = await ctx.db.get(args.logId);

    if (!entry?.idempotencyKey) return;

    const history = await ctx.db
      .query("appointmentWorkflowHistory")
      .withIndex("by_idempotencyKey", (q) =>
        q.eq("idempotencyKey", entry.idempotencyKey!),
      )
      .unique();

    if (history) {
      await ctx.db.patch(history._id, {
        status: args.status,
        renderedSubject: args.renderedSubject ?? history.renderedSubject,
        renderedBody: args.renderedBody ?? history.renderedBody,
        errorMessage: args.errorMessage,
        processedAt,
        updatedAt: processedAt,
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Internal action — async event processing
// ---------------------------------------------------------------------------

/**
 * Process a pending email event log entry:
 * 1. Load the log entry
 * 2. Find enabled bindings for the eventType in that org (sorted by priority)
 * 3. For the highest-priority binding: delegate to emailSending action
 * 4. Update log status
 *
 * Idempotent: exits early if status is already non-pending.
 */
export const processEvent = internalAction({
  args: { logId: v.id("emailEventLog") },
  handler: async (ctx, args) => {
    const entry = await ctx.runQuery(internal.emailEvents.getLogEntry, {
      logId: args.logId,
    });

    if (!entry || entry.status !== "pending") {
      return; // Already processed or missing
    }

    // Find enabled bindings for this org + eventType, sorted by priority
    const db = createSupabaseDb();
    const bindings = await db
      .query("emailEventBindings")
      .eq("organizationId", String(entry.organizationId))
      .eq("eventType", entry.eventType)
      .eq("enabled", true)
      .order("priority", true)
      .collect();

    if (bindings.length === 0) {
      await ctx.runMutation(internal.emailEvents.updateLogStatus, {
        logId: args.logId,
        status: "skipped",
        errorMessage: "No enabled bindings found for event type",
      });
      return;
    }

    // Use highest-priority binding (lowest priority number)
    const binding = bindings[0];

    // Delegate actual rendering + sending to emailSending action
    await ctx.runAction(internal.emailSending.sendTemplateEmail, {
      logId: args.logId,
      templateId: binding.templateId,
      organizationId: entry.organizationId,
      recipientEmail: entry.recipientEmail,
      recipientName: entry.recipientName,
      variables: entry.payload ?? "{}",
      bindingId: binding._id,
    });
  },
});
