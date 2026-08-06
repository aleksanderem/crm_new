/**
 * Supabase Automation Run Step Write Actions
 *
 * Internal actions that persist automation run step data to Supabase as the
 * primary store. Uses createSupabaseDb() so the in-memory test mock works.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createSupabaseDb } from "../_helpers/supabaseDb";

export const writeRunStep = internalAction({
  args: {
    stepId: v.string(),
    organizationId: v.string(),
    runId: v.string(),
    ruleId: v.optional(v.string()),
    actionIndex: v.number(),
    actionType: v.string(),
    idempotencyKey: v.string(),
    status: v.string(),
    recipient: v.optional(v.string()),
    recipientName: v.optional(v.string()),
    linkedEntityType: v.optional(v.string()),
    linkedEntityId: v.optional(v.string()),
    renderedSubject: v.optional(v.string()),
    renderedBody: v.optional(v.string()),
    metadataSnapshot: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    emailEventLogId: v.optional(v.string()),
    appointmentSmsEventId: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const db = createSupabaseDb();
    await db.insert("automationRunSteps", {
      _id: args.stepId,
      organizationId: args.organizationId,
      runId: args.runId,
      ruleId: args.ruleId ?? null,
      actionIndex: args.actionIndex,
      actionType: args.actionType,
      idempotencyKey: args.idempotencyKey,
      status: args.status,
      recipient: args.recipient ?? null,
      recipientName: args.recipientName ?? null,
      linkedEntityType: args.linkedEntityType ?? null,
      linkedEntityId: args.linkedEntityId ?? null,
      renderedSubject: args.renderedSubject ?? null,
      renderedBody: args.renderedBody ?? null,
      metadataSnapshot: args.metadataSnapshot ?? null,
      errorMessage: args.errorMessage ?? null,
      emailEventLogId: args.emailEventLogId ?? null,
      appointmentSmsEventId: args.appointmentSmsEventId ?? null,
      processedAt: args.processedAt ?? null,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });

    console.info(`Automation run step written to Supabase id=${args.stepId} org=${args.organizationId}`);
    return { success: true, id: args.stepId };
  },
});

export const updateRunStep = internalAction({
  args: {
    stepId: v.string(),
    organizationId: v.string(),
    status: v.optional(v.string()),
    recipient: v.optional(v.string()),
    recipientName: v.optional(v.string()),
    linkedEntityType: v.optional(v.string()),
    linkedEntityId: v.optional(v.string()),
    renderedSubject: v.optional(v.string()),
    renderedBody: v.optional(v.string()),
    metadataSnapshot: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    emailEventLogId: v.optional(v.string()),
    appointmentSmsEventId: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const db = createSupabaseDb();
    const updates: Record<string, unknown> = { updatedAt: args.updatedAt };
    if (args.status !== undefined) updates.status = args.status;
    if (args.recipient !== undefined) updates.recipient = args.recipient;
    if (args.recipientName !== undefined) updates.recipientName = args.recipientName;
    if (args.linkedEntityType !== undefined) updates.linkedEntityType = args.linkedEntityType;
    if (args.linkedEntityId !== undefined) updates.linkedEntityId = args.linkedEntityId;
    if (args.renderedSubject !== undefined) updates.renderedSubject = args.renderedSubject;
    if (args.renderedBody !== undefined) updates.renderedBody = args.renderedBody;
    if (args.metadataSnapshot !== undefined) updates.metadataSnapshot = args.metadataSnapshot;
    if (args.errorMessage !== undefined) updates.errorMessage = args.errorMessage;
    if (args.emailEventLogId !== undefined) updates.emailEventLogId = args.emailEventLogId;
    if (args.appointmentSmsEventId !== undefined) updates.appointmentSmsEventId = args.appointmentSmsEventId;
    if (args.processedAt !== undefined) updates.processedAt = args.processedAt;

    try {
      await db.patch("automationRunSteps", args.stepId, updates);
    } catch {
      console.warn(
        `Automation run step ${args.stepId} not found in Supabase; skipping update.`,
      );
      return { success: false, id: args.stepId };
    }

    console.info(`Automation run step updated in Supabase id=${args.stepId} org=${args.organizationId}`);
    return { success: true, id: args.stepId };
  },
});
