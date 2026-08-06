/**
 * Email Sequences — backend schema and execution engine.
 *
 * A sequence is a series of timed email steps triggered by an event type.
 * When triggerEmailEvent fires, active sequences for that event are enrolled.
 * Each step sends a template email after its configured delayMs.
 */

import {
  query,
  action,
  internalMutation,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { verifyOrgAccess } from "./_helpers/auth";
import { createSupabaseDb } from "./_helpers/supabaseDb";

// Dual-write refs removed — Supabase is now primary for sequence writes

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * List all sequences for an org.
 */
export const listSequences = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return ctx.db
      .query("emailSequences")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

/**
 * Get a single sequence with all its steps.
 */
export const getSequence = query({
  args: {
    organizationId: v.id("organizations"),
    sequenceId: v.id("emailSequences"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const sequence = await ctx.db.get(args.sequenceId);
    if (!sequence || sequence.organizationId !== args.organizationId) {
      return null;
    }
    const steps = await ctx.db
      .query("emailSequenceSteps")
      .withIndex("by_sequence", (q) => q.eq("sequenceId", args.sequenceId))
      .collect();
    // Return steps sorted by order
    return {
      ...sequence,
      steps: steps.sort((a, b) => a.order - b.order),
    };
  },
});

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
 * Enroll a recipient into a sequence and schedule the first step.
 * Called by emailEventTrigger when a matching sequence is found.
 */
export const enrollRecipient = internalMutation({
  args: {
    sequenceId: v.id("emailSequences"),
    organizationId: v.id("organizations"),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Load first step (order 0)
    const steps = await ctx.db
      .query("emailSequenceSteps")
      .withIndex("by_sequence", (q) => q.eq("sequenceId", args.sequenceId))
      .collect();

    const sortedSteps = steps.sort((a, b) => a.order - b.order);
    if (sortedSteps.length === 0) {
      // No steps — nothing to enroll
      return null;
    }

    const now = Date.now();
    const enrollmentId = await ctx.db.insert("emailSequenceEnrollments", {
      sequenceId: args.sequenceId,
      organizationId: args.organizationId,
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      payload: args.payload,
      currentStep: 0,
      status: "active",
      enrolledAt: now,
    });

    // Schedule first step
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
 * Sends the step's template email, then schedules the next step (or completes).
 */
export const processNextStep = internalAction({
  args: {
    enrollmentId: v.id("emailSequenceEnrollments"),
  },
  handler: async (ctx, args) => {
    const enrollment = await ctx.runQuery(
      internal.emailSequences.getEnrollmentInternal,
      { enrollmentId: args.enrollmentId },
    );

    if (!enrollment) return;
    if (enrollment.status !== "active") return; // cancelled or completed

    // Load all steps sorted by order
    const steps = await ctx.runQuery(
      internal.emailSequences.getStepsInternal,
      { sequenceId: enrollment.sequenceId },
    );

    if (enrollment.currentStep >= steps.length) {
      // No more steps — mark completed
      await ctx.runMutation(internal.emailSequences.markEnrollmentCompleted, {
        enrollmentId: args.enrollmentId,
      });
      return;
    }

    const step = steps[enrollment.currentStep];

    // Insert an emailEventLog entry so sendTemplateEmail can log status
    const logId = await ctx.runMutation(
      internal.emailSequences.insertSequenceLog,
      {
        organizationId: enrollment.organizationId,
        sequenceId: enrollment.sequenceId,
        templateId: step.templateId,
        recipientEmail: enrollment.recipientEmail,
        recipientName: enrollment.recipientName,
        payload: enrollment.payload,
      },
    );

    // Send the email via existing sendTemplateEmail infrastructure
    await ctx.runAction(internal.emailSending.sendTemplateEmail, {
      logId,
      templateId: step.templateId,
      organizationId: enrollment.organizationId,
      recipientEmail: enrollment.recipientEmail,
      recipientName: enrollment.recipientName,
      variables: enrollment.payload ?? "{}",
    });

    const nextStepIndex = enrollment.currentStep + 1;

    if (nextStepIndex >= steps.length) {
      // All steps done — complete the enrollment
      await ctx.runMutation(internal.emailSequences.markEnrollmentCompleted, {
        enrollmentId: args.enrollmentId,
      });
      return;
    }

    // Advance to next step and schedule it
    const nextStep = steps[nextStepIndex];
    await ctx.runMutation(internal.emailSequences.advanceEnrollmentStep, {
      enrollmentId: args.enrollmentId,
      nextStep: nextStepIndex,
    });
    await ctx.scheduler.runAfter(
      nextStep.delayMs,
      internal.emailSequences.processNextStep,
      { enrollmentId: args.enrollmentId },
    );
  },
});

// ---------------------------------------------------------------------------
// Internal helpers (queries/mutations used by processNextStep)
// ---------------------------------------------------------------------------

export const getEnrollmentInternal = internalQuery({
  args: { enrollmentId: v.id("emailSequenceEnrollments") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.enrollmentId);
  },
});

export const getStepsInternal = internalQuery({
  args: { sequenceId: v.id("emailSequences") },
  handler: async (ctx, args) => {
    const steps = await ctx.db
      .query("emailSequenceSteps")
      .withIndex("by_sequence", (q) => q.eq("sequenceId", args.sequenceId))
      .collect();
    return steps.sort((a, b) => a.order - b.order);
  },
});

export const markEnrollmentCompleted = internalMutation({
  args: { enrollmentId: v.id("emailSequenceEnrollments") },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.enrollmentId, {
      status: "completed",
      completedAt: now,
    });
  },
});

export const advanceEnrollmentStep = internalMutation({
  args: {
    enrollmentId: v.id("emailSequenceEnrollments"),
    nextStep: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.enrollmentId, {
      currentStep: args.nextStep,
    });
  },
});

export const insertSequenceLog = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    sequenceId: v.id("emailSequences"),
    templateId: v.id("emailTemplates"),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const logId = await ctx.db.insert("emailEventLog", {
      organizationId: args.organizationId,
      eventType: `sequence.step`,
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
