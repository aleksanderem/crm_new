/**
 * Convex → Supabase Call Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeCallToSupabase = internalAction({
  args: {
    callId: v.string(),
    organizationId: v.string(),
    outcome: v.string(),
    callDate: v.number(),
    note: v.optional(v.string()),
    duration: v.optional(v.number()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.callId,
      organization_id: args.organizationId,
      outcome: args.outcome,
      call_date: args.callDate,
      note: args.note ?? null,
      duration: args.duration ?? null,
      tag_ids: args.tagIds ?? null,
      category_id: args.categoryId ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "calls", row);

    console.info(`Call written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateCallInSupabase = internalAction({
  args: {
    callId: v.string(),
    organizationId: v.string(),
    outcome: v.optional(v.string()),
    callDate: v.optional(v.number()),
    note: v.optional(v.string()),
    duration: v.optional(v.number()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.outcome !== undefined) row.outcome = args.outcome;
    if (args.callDate !== undefined) row.call_date = args.callDate;
    if (args.note !== undefined) row.note = args.note;
    if (args.duration !== undefined) row.duration = args.duration;
    if (args.tagIds !== undefined) row.tag_ids = args.tagIds;
    if (args.categoryId !== undefined) row.category_id = args.categoryId;

    const { data, error } = await client
      .from("calls")
      .update(row)
      .eq("id", args.callId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for call ${args.callId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Call updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteCallFromSupabase = internalAction({
  args: {
    callId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("calls")
      .delete()
      .eq("id", args.callId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for call ${args.callId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Call deleted from Supabase id=${args.callId} org=${args.organizationId}`);
    return { success: true, id: args.callId };
  },
});
