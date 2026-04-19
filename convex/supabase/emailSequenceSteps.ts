/**
 * Convex → Supabase Email Sequence Steps Write Actions
 *
 * Internal actions that persist email sequence step data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeEmailSequenceStepToSupabase = internalAction({
  args: {
    emailSequenceStepId: v.string(),
    sequenceId: v.string(),
    organizationId: v.string(),
    order: v.number(),
    delayMs: v.number(),
    templateId: v.string(),
    conditionJson: v.optional(v.string()),
    createdAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.emailSequenceStepId,
      sequence_id: args.sequenceId,
      organization_id: args.organizationId,
      order: args.order,
      delay_ms: args.delayMs,
      template_id: args.templateId,
      condition_json: args.conditionJson ?? null,
      created_at: args.createdAt,
    };

    const data = await upsertWithFkRetry(client, "email_sequence_steps", row);

    console.info(`EmailSequenceStep written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteEmailSequenceStepFromSupabase = internalAction({
  args: {
    emailSequenceStepId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("email_sequence_steps")
      .delete()
      .eq("id", args.emailSequenceStepId);

    if (error) {
      const msg = `Supabase delete failed for email_sequence_step ${args.emailSequenceStepId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`EmailSequenceStep deleted from Supabase id=${args.emailSequenceStepId} org=${args.organizationId}`);
    return { success: true, id: args.emailSequenceStepId };
  },
});
