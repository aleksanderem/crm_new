/**
 * Email Sequences — backend schema and execution engine.
 *
 * A sequence is a series of timed email steps triggered by an event type.
 * When triggerEmailEvent fires, active sequences for that event are enrolled.
 * Each step sends a template email after its configured delayMs.
 */

import {
  query,
  mutation,
  internalMutation,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { verifyOrgAccess } from "./_helpers/auth";
import { checkPermission } from "./_helpers/permissions";

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
// Mutations — admin-gated CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new email sequence.
 */
export const createSequence = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    triggerEventType: v.string(),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const perm = await checkPermission(ctx, args.organizationId, "settings", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const now = Date.now();
    return ctx.db.insert("emailSequences", {
      organizationId: args.organizationId,
      name: args.name,
      triggerEventType: args.triggerEventType,
      isActive: args.isActive ?? false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update an existing sequence.
 */
export const updateSequence = mutation({
  args: {
    organizationId: v.id("organizations"),
    sequenceId: v.id("emailSequences"),
    name: v.optional(v.string()),
    triggerEventType: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const perm = await checkPermission(ctx, args.organizationId, "settings", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const sequence = await ctx.db.get(args.sequenceId);
    if (!sequence || sequence.organizationId !== args.organizationId) {
      throw new Error("Sequence not found");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name;
    if (args.triggerEventType !== undefined) patch.triggerEventType = args.triggerEventType;
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    await ctx.db.patch(args.sequenceId, patch);
  },
});

/**
 * Delete a sequence and all its steps.
 * Active enrollments are cancelled automatically.
 */
export const deleteSequence = mutation({
  args: {
    organizationId: v.id("organizations"),
    sequenceId: v.id("emailSequences"),
  },
  handler: async (ctx, args) => {
    const perm = await checkPermission(ctx, args.organizationId, "settings", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const sequence = await ctx.db.get(args.sequenceId);
    if (!sequence || sequence.organizationId !== args.organizationId) {
      throw new Error("Sequence not found");
    }

    // Delete all steps
    const steps = await ctx.db
      .query("emailSequenceSteps")
      .withIndex("by_sequence", (q) => q.eq("sequenceId", args.sequenceId))
      .collect();
    for (const step of steps) {
      await ctx.db.delete(step._id);
    }

    // Cancel active enrollments
    const enrollments = await ctx.db
      .query("emailSequenceEnrollments")
      .withIndex("by_sequence", (q) => q.eq("sequenceId", args.sequenceId))
      .collect();
    const now = Date.now();
    for (const enrollment of enrollments) {
      if (enrollment.status === "active") {
        await ctx.db.patch(enrollment._id, {
          status: "cancelled",
          cancelledAt: now,
        });
      }
    }

    await ctx.db.delete(args.sequenceId);
  },
});

/**
 * Upsert a step in a sequence.
 * If stepId provided, update; otherwise insert.
 */
export const upsertStep = mutation({
  args: {
    organizationId: v.id("organizations"),
    sequenceId: v.id("emailSequences"),
    stepId: v.optional(v.id("emailSequenceSteps")),
    order: v.number(),
    delayMs: v.number(),
    templateId: v.id("emailTemplates"),
    conditionJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const perm = await checkPermission(ctx, args.organizationId, "settings", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const sequence = await ctx.db.get(args.sequenceId);
    if (!sequence || sequence.organizationId !== args.organizationId) {
      throw new Error("Sequence not found");
    }

    const now = Date.now();

    if (args.stepId) {
      const existing = await ctx.db.get(args.stepId);
      if (!existing || existing.sequenceId !== args.sequenceId) {
        throw new Error("Step not found");
      }
      await ctx.db.patch(args.stepId, {
        order: args.order,
        delayMs: args.delayMs,
        templateId: args.templateId,
        conditionJson: args.conditionJson,
      });
      return args.stepId;
    }

    return ctx.db.insert("emailSequenceSteps", {
      sequenceId: args.sequenceId,
      organizationId: args.organizationId,
      order: args.order,
      delayMs: args.delayMs,
      templateId: args.templateId,
      conditionJson: args.conditionJson,
      createdAt: now,
    });
  },
});

/**
 * Delete a step from a sequence.
 */
export const deleteStep = mutation({
  args: {
    organizationId: v.id("organizations"),
    stepId: v.id("emailSequenceSteps"),
  },
  handler: async (ctx, args) => {
    const perm = await checkPermission(ctx, args.organizationId, "settings", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const step = await ctx.db.get(args.stepId);
    if (!step || step.organizationId !== args.organizationId) {
      throw new Error("Step not found");
    }

    await ctx.db.delete(args.stepId);
  },
});

/**
 * Cancel a recipient's active enrollment in a sequence.
 */
export const cancelEnrollment = mutation({
  args: {
    organizationId: v.id("organizations"),
    enrollmentId: v.id("emailSequenceEnrollments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment || enrollment.organizationId !== args.organizationId) {
      throw new Error("Enrollment not found");
    }
    if (enrollment.status !== "active") {
      return; // Already cancelled or completed — idempotent
    }

    await ctx.db.patch(args.enrollmentId, {
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
    await ctx.db.patch(args.enrollmentId, {
      status: "completed",
      completedAt: Date.now(),
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
    return ctx.db.insert("emailEventLog", {
      organizationId: args.organizationId,
      eventType: `sequence.step`,
      templateId: args.templateId,
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      payload: args.payload,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});
