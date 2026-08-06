/**
 * Supabase Automation Run Write Actions
 *
 * Internal actions that persist automation run data to Supabase as the primary
 * store. Uses createSupabaseDb() so the in-memory test mock works correctly.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createSupabaseDb } from "../_helpers/supabaseDb";

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
    const db = createSupabaseDb();
    await db.insert("automationRuns", {
      _id: args.runId,
      organizationId: args.organizationId,
      ruleId: args.ruleId ?? null,
      module: args.module,
      eventType: args.eventType,
      entityType: args.entityType ?? null,
      entityId: args.entityId ?? null,
      eventIdempotencyKey: args.eventIdempotencyKey,
      correlationKey: args.correlationKey ?? null,
      payloadSnapshot: args.payloadSnapshot,
      actorUserId: args.actorUserId ?? null,
      status: args.status,
      errorMessage: args.errorMessage ?? null,
      occurredAt: args.occurredAt,
      processedAt: args.processedAt ?? null,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });

    console.info(`Automation run written to Supabase id=${args.runId} org=${args.organizationId}`);
    return { success: true, id: args.runId };
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
    const db = createSupabaseDb();
    const updates: Record<string, unknown> = { updatedAt: args.updatedAt };
    if (args.ruleId !== undefined) updates.ruleId = args.ruleId;
    if (args.status !== undefined) updates.status = args.status;
    if (args.errorMessage !== undefined) updates.errorMessage = args.errorMessage;
    if (args.processedAt !== undefined) updates.processedAt = args.processedAt;

    try {
      await db.patch("automationRuns", args.runId, updates);
    } catch {
      console.warn(
        `Automation run ${args.runId} not found in Supabase; skipping update.`,
      );
      return { success: false, id: args.runId };
    }

    console.info(`Automation run updated in Supabase id=${args.runId} org=${args.organizationId}`);
    return { success: true, id: args.runId };
  },
});
