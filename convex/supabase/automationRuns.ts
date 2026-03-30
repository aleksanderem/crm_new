/**
 * Convex → Supabase Automation Run Write Actions
 *
 * Internal actions that persist automation run data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeRun = internalAction({
  args: {
    runId: v.string(),
    organizationId: v.string(),
    ruleId: v.optional(v.string()),
    module: v.string(),
    eventType: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    eventIdempotencyKey: v.string(),
    correlationKey: v.optional(v.string()),
    payloadSnapshot: v.string(),
    actorUserId: v.optional(v.string()),
    status: v.string(),
    errorMessage: v.optional(v.string()),
    occurredAt: v.number(),
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.runId,
      organization_id: args.organizationId,
      rule_id: args.ruleId ?? null,
      module: args.module,
      event_type: args.eventType,
      entity_type: args.entityType ?? null,
      entity_id: args.entityId ?? null,
      event_idempotency_key: args.eventIdempotencyKey,
      correlation_key: args.correlationKey ?? null,
      payload_snapshot: args.payloadSnapshot,
      actor_user_id: args.actorUserId ?? null,
      status: args.status,
      error_message: args.errorMessage ?? null,
      occurred_at: args.occurredAt,
      processed_at: args.processedAt ?? null,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("automation_runs")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for automation run: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Automation run written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateRun = internalAction({
  args: {
    runId: v.string(),
    organizationId: v.string(),
    ruleId: v.optional(v.string()),
    status: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.ruleId !== undefined) row.rule_id = args.ruleId;
    if (args.status !== undefined) row.status = args.status;
    if (args.errorMessage !== undefined) row.error_message = args.errorMessage;
    if (args.processedAt !== undefined) row.processed_at = args.processedAt;

    const { data, error } = await client
      .from("automation_runs")
      .update(row)
      .eq("id", args.runId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for automation run ${args.runId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Automation run updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});
