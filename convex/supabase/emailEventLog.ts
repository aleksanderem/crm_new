/**
 * Convex → Supabase Email Event Log Write Actions
 *
 * Internal actions that persist email event log data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeEmailEventLogToSupabase = internalAction({
  args: {
    emailEventLogId: v.string(),
    organizationId: v.string(),
    eventType: v.string(),
    bindingId: v.optional(v.string()),
    templateId: v.optional(v.string()),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    status: v.string(),
    payload: v.optional(v.string()),
    source: v.optional(v.string()),
    relatedEntityType: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    renderedSubject: v.optional(v.string()),
    renderedBody: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    triggeredBy: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.emailEventLogId,
      organization_id: args.organizationId,
      event_type: args.eventType,
      binding_id: args.bindingId ?? null,
      template_id: args.templateId ?? null,
      recipient_email: args.recipientEmail,
      recipient_name: args.recipientName ?? null,
      status: args.status,
      payload: args.payload ?? null,
      source: args.source ?? null,
      related_entity_type: args.relatedEntityType ?? null,
      related_entity_id: args.relatedEntityId ?? null,
      idempotency_key: args.idempotencyKey ?? null,
      rendered_subject: args.renderedSubject ?? null,
      rendered_body: args.renderedBody ?? null,
      error_message: args.errorMessage ?? null,
      triggered_by: args.triggeredBy ?? null,
      processed_at: args.processedAt ?? null,
      created_at: args.createdAt,
    };

    const data = await upsertWithFkRetry(client, "email_event_log", row);

    console.info(`EmailEventLog written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

