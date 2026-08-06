/**
 * Email Sequences — backend schema and execution engine.
 *
 * A sequence is a series of timed email steps triggered by an event type.
 * When triggerEmailEvent fires, active sequences for that event are enrolled.
 * Each step sends a template email after its configured delayMs.
 */

import {
  action,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";

// Dual-write refs removed — Supabase is now primary for sequence writes

// ---------------------------------------------------------------------------
// Actions — admin-gated CRUD (Supabase-primary)
// ---------------------------------------------------------------------------

/**
 * Create a new email sequence.
 */
export const createSequence = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    triggerEventType: v.string(),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!authResult.allowed) throw new Error("Permission denied");

    const now = Date.now();
    const db = createSupabaseDb();

    const sequenceId = await db.insert("emailSequences", {
      organizationId: String(args.organizationId),
      name: args.name,
      triggerEventType: args.triggerEventType,
      isActive: args.isActive ?? false,
      createdAt: now,
      updatedAt: now,
    });

    return sequenceId;
  },
});

/**
 * Update an existing sequence.
 */
export const updateSequence = action({
  args: {
    organizationId: v.id("organizations"),
    sequenceId: v.string(),
    name: v.optional(v.string()),
    triggerEventType: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!authResult.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const sequence = await db.get("emailSequences", args.sequenceId);
    if (!sequence || String(sequence.organizationId) !== String(args.organizationId)) {
      throw new Error("Sequence not found");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name;
    if (args.triggerEventType !== undefined) patch.triggerEventType = args.triggerEventType;
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    await db.patch("emailSequences", args.sequenceId, patch);
  },
});

/**
 * Delete a sequence and all its steps.
 * Active enrollments are cancelled automatically.
 */
export const deleteSequence = action({
  args: {
    organizationId: v.id("organizations"),
    sequenceId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!authResult.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const sequence = await db.get("emailSequences", args.sequenceId);
    if (!sequence || String(sequence.organizationId) !== String(args.organizationId)) {
      throw new Error("Sequence not found");
    }

    // Delete all steps from Supabase
    const steps = await db.query("emailSequenceSteps")
      .eq("sequenceId", args.sequenceId)
      .collect();
    for (const step of steps) {
      await db.delete("emailSequenceSteps", step._id as string);
    }

    // Cancel active enrollments
    const enrollments = await db.query("emailSequenceEnrollments")
      .eq("sequenceId", args.sequenceId)
      .collect();
    const now = Date.now();
    for (const enrollment of enrollments) {
      if (enrollment.status === "active") {
        await db.patch("emailSequenceEnrollments", enrollment._id as string, {
          status: "cancelled",
          cancelledAt: now,
        });
      }
    }

    // Delete the sequence
    await db.delete("emailSequences", args.sequenceId);
  },
});

/**
 * Upsert a step in a sequence.
 * If stepId provided, update; otherwise insert.
 */
export const upsertStep = action({
  args: {
    organizationId: v.id("organizations"),
    sequenceId: v.string(),
    stepId: v.optional(v.string()),
    order: v.number(),
    delayMs: v.number(),
    templateId: v.string(),
    conditionJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!authResult.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const sequence = await db.get("emailSequences", args.sequenceId);
    if (!sequence || String(sequence.organizationId) !== String(args.organizationId)) {
      throw new Error("Sequence not found");
    }

    const now = Date.now();

    if (args.stepId) {
      const existing = await db.get("emailSequenceSteps", args.stepId);
      if (!existing || String(existing.sequenceId) !== args.sequenceId) {
        throw new Error("Step not found");
      }
      await db.patch("emailSequenceSteps", args.stepId, {
        order: args.order,
        delayMs: args.delayMs,
        templateId: args.templateId,
        conditionJson: args.conditionJson ?? null,
      });
      return args.stepId;
    }

    const newId = await db.insert("emailSequenceSteps", {
      sequenceId: args.sequenceId,
      organizationId: String(args.organizationId),
      order: args.order,
      delayMs: args.delayMs,
      templateId: args.templateId,
      conditionJson: args.conditionJson ?? null,
      createdAt: now,
    });
    return newId;
  },
});

/**
 * Delete a step from a sequence.
 */
export const deleteStep = action({
  args: {
    organizationId: v.id("organizations"),
    stepId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!authResult.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const step = await db.get("emailSequenceSteps", args.stepId);
    if (!step || String(step.organizationId) !== String(args.organizationId)) {
      throw new Error("Step not found");
    }

    await db.delete("emailSequenceSteps", args.stepId);
  },
});

/**
 * Cancel a recipient's active enrollment in a sequence.
 */
export const cancelEnrollment = action({
  args: {
    organizationId: v.id("organizations"),
    enrollmentId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const enrollment = await db.get("emailSequenceEnrollments", args.enrollmentId);
    if (!enrollment || String(enrollment.organizationId) !== String(args.organizationId)) {
      throw new Error("Enrollment not found");
    }
    if (enrollment.status !== "active") {
      return; // Already cancelled or completed — idempotent
    }

    await db.patch("emailSequenceEnrollments", args.enrollmentId, {
      status: "cancelled",
      cancelledAt: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// Internal: enrollment + step execution
// ---------------------------------------------------------------------------

/**
 * Reads active sequences from Supabase for the given org + eventType, then
 * schedules enrollRecipient for each match.  Called by triggerEmailEvent so
 * the mutation doesn't attempt an HTTP call (mutations can't do I/O).
 */
export const enrollForEvent = internalAction({
  args: {
    organizationId: v.id("organizations"),
    eventType: v.string(),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const sequences = await db
      .query("emailSequences")
      .eq("organizationId", String(args.organizationId))
      .eq("isActive", true)
      .eq("triggerEventType", args.eventType)
      .collect();

    for (const sequence of sequences) {
      await ctx.scheduler.runAfter(
        0,
        internal.emailSequences.enrollRecipient,
        {
          sequenceId: sequence._id as string,
          organizationId: args.organizationId,
          recipientEmail: args.recipientEmail,
          recipientName: args.recipientName,
          payload: args.payload,
        },
      );
    }
  },
});

export const enrollRecipient = internalAction({
  args: {
    sequenceId: v.string(),
    organizationId: v.id("organizations"),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    const steps = await db
      .query("emailSequenceSteps")
      .eq("sequenceId", String(args.sequenceId))
      .collect();

    const sortedSteps = steps.sort((a, b) => a.order - b.order);
    if (sortedSteps.length === 0) {
      return null;
    }

    const now = Date.now();
    const enrollmentId = await db.insert("emailSequenceEnrollments", {
      sequenceId: String(args.sequenceId),
      organizationId: String(args.organizationId),
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName ?? null,
      payload: args.payload ?? null,
      currentStep: 0,
      status: "active",
      enrolledAt: now,
    });

    const firstStep = sortedSteps[0];
    await ctx.scheduler.runAfter(
      firstStep.delayMs,
      internal.emailSequences.processNextStep,
      { enrollmentId },
    );

    return enrollmentId;
  },
});

/**
 * Process the current step for an enrollment.
 * Reads enrollment and steps from Supabase, sends the step's template email,
 * then schedules the next step (or marks completed).
 */
export const processNextStep = internalAction({
  args: {
    enrollmentId: v.string(),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    const enrollment = await db.get("emailSequenceEnrollments", args.enrollmentId);
    if (!enrollment) return;
    if (enrollment.status !== "active") return;

    const steps = await db
      .query("emailSequenceSteps")
      .eq("sequenceId", String(enrollment.sequenceId))
      .collect();
    const sortedSteps = steps.sort((a, b) => a.order - b.order);

    if (enrollment.currentStep >= sortedSteps.length) {
      await db.patch("emailSequenceEnrollments", args.enrollmentId, {
        status: "completed",
        completedAt: Date.now(),
      });
      return;
    }

    const step = sortedSteps[enrollment.currentStep];

    const logId = await ctx.runMutation(
      internal.emailSequences.insertSequenceLog,
      {
        organizationId: enrollment.organizationId,
        sequenceId: String(enrollment.sequenceId),
        templateId: String(step.templateId),
        recipientEmail: enrollment.recipientEmail,
        recipientName: enrollment.recipientName ?? undefined,
        payload: enrollment.payload ?? undefined,
      },
    );

    await ctx.runAction(internal.emailSending.sendTemplateEmail, {
      logId,
      templateId: String(step.templateId),
      organizationId: enrollment.organizationId,
      recipientEmail: enrollment.recipientEmail,
      recipientName: enrollment.recipientName ?? undefined,
      variables: enrollment.payload ?? "{}",
    });

    const nextStepIndex = enrollment.currentStep + 1;

    if (nextStepIndex >= sortedSteps.length) {
      await db.patch("emailSequenceEnrollments", args.enrollmentId, {
        status: "completed",
        completedAt: Date.now(),
      });
      return;
    }

    const nextStep = sortedSteps[nextStepIndex];
    await db.patch("emailSequenceEnrollments", args.enrollmentId, {
      currentStep: nextStepIndex,
    });
    await ctx.scheduler.runAfter(
      nextStep.delayMs,
      internal.emailSequences.processNextStep,
      { enrollmentId: args.enrollmentId },
    );
  },
});

// ---------------------------------------------------------------------------
// Internal mutation: insert an emailEventLog entry for sequence step tracking.
// Writes to Convex so sendTemplateEmail receives a valid Convex logId.
// ---------------------------------------------------------------------------

export const insertSequenceLog = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    sequenceId: v.string(),
    templateId: v.string(),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const logId = await ctx.db.insert("emailEventLog", {
      organizationId: args.organizationId,
      eventType: "sequence.step",
      templateId: args.templateId,
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      payload: args.payload,
      status: "pending",
      createdAt: now,
    });

    return logId;
  },
});
