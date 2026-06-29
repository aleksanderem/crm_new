/**
 * Convex → Supabase Automation Run Step Write Actions
 *
 * Internal actions that persist automation run step data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

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
    const client = createServiceRoleClient();

    const row = {
      id: args.stepId,
      organization_id: args.organizationId,
      run_id: args.runId,
      rule_id: args.ruleId ?? null,
      action_index: args.actionIndex,
      action_type: args.actionType,
      idempotency_key: args.idempotencyKey,
      status: args.status,
      recipient: args.recipient ?? null,
      recipient_name: args.recipientName ?? null,
      linked_entity_type: args.linkedEntityType ?? null,
      linked_entity_id: args.linkedEntityId ?? null,
      rendered_subject: args.renderedSubject ?? null,
      rendered_body: args.renderedBody ?? null,
      metadata_snapshot: args.metadataSnapshot ?? null,
      error_message: args.errorMessage ?? null,
      email_event_log_id: args.emailEventLogId ?? null,
      appointment_sms_event_id: args.appointmentSmsEventId ?? null,
      processed_at: args.processedAt ?? null,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "automation_run_steps", row)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`supabaseDb.insert(automation_run_steps): ${msg}`);
      });

    console.info(`Automation run step written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
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
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.status !== undefined) row.status = args.status;
    if (args.recipient !== undefined) row.recipient = args.recipient;
    if (args.recipientName !== undefined) row.recipient_name = args.recipientName;
    if (args.linkedEntityType !== undefined) row.linked_entity_type = args.linkedEntityType;
    if (args.linkedEntityId !== undefined) row.linked_entity_id = args.linkedEntityId;
    if (args.renderedSubject !== undefined) row.rendered_subject = args.renderedSubject;
    if (args.renderedBody !== undefined) row.rendered_body = args.renderedBody;
    if (args.metadataSnapshot !== undefined) row.metadata_snapshot = args.metadataSnapshot;
    if (args.errorMessage !== undefined) row.error_message = args.errorMessage;
    if (args.emailEventLogId !== undefined) row.email_event_log_id = args.emailEventLogId;
    if (args.appointmentSmsEventId !== undefined) row.appointment_sms_event_id = args.appointmentSmsEventId;
    if (args.processedAt !== undefined) row.processed_at = args.processedAt;

    const { data, error } = await client
      .from("automation_run_steps")
      .update(row)
      .eq("id", args.stepId)
      .select("id")
      .maybeSingle();

    if (error) {
      const msg = `Supabase update failed for automation run step ${args.stepId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data) {
      // Row doesn't exist in Supabase yet (Convex-primary create hasn't mirrored).
      // Don't throw — auxiliary audit trail.
      console.warn(
        `Automation run step ${args.stepId} not found in Supabase; skipping update.`,
      );
      return { success: false, id: args.stepId };
    }

    console.info(`Automation run step updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});
