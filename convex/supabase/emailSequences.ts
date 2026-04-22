/**
 * Convex → Supabase Email Sequences Write Actions
 *
 * Internal actions that persist email sequence data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeEmailSequenceToSupabase = internalAction({
  args: {
    emailSequenceId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    triggerEventType: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.emailSequenceId,
      organization_id: args.organizationId,
      name: args.name,
      trigger_event_type: args.triggerEventType,
      is_active: args.isActive,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "email_sequences", row);

    console.info(`EmailSequence written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateEmailSequenceInSupabase = internalAction({
  args: {
    emailSequenceId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    triggerEventType: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.triggerEventType !== undefined) row.trigger_event_type = args.triggerEventType;
    if (args.isActive !== undefined) row.is_active = args.isActive;

    const { data, error } = await client
      .from("email_sequences")
      .update(row)
      .eq("id", args.emailSequenceId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for email_sequence ${args.emailSequenceId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`EmailSequence updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteEmailSequenceFromSupabase = internalAction({
  args: {
    emailSequenceId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("email_sequences")
      .delete()
      .eq("id", args.emailSequenceId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for email_sequence ${args.emailSequenceId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`EmailSequence deleted from Supabase id=${args.emailSequenceId} org=${args.organizationId}`);
    return { success: true, id: args.emailSequenceId };
  },
});
