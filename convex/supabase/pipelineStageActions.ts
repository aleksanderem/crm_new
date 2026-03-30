/**
 * Convex → Supabase Pipeline Stage Action Write Actions
 *
 * Internal actions that persist pipeline stage action data to PostgreSQL
 * via Supabase service-role client (bypasses RLS).
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeStageActionToSupabase = internalAction({
  args: {
    actionId: v.string(),
    organizationId: v.string(),
    stageId: v.string(),
    actionType: v.string(),
    config: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.actionId,
      organization_id: args.organizationId,
      stage_id: args.stageId,
      action_type: args.actionType,
      config: args.config,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("pipeline_stage_actions")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for pipeline stage action: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Pipeline stage action written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateStageActionInSupabase = internalAction({
  args: {
    actionId: v.string(),
    organizationId: v.string(),
    config: v.any(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      config: args.config,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("pipeline_stage_actions")
      .update(row)
      .eq("id", args.actionId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for pipeline stage action ${args.actionId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Pipeline stage action updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteStageActionFromSupabase = internalAction({
  args: {
    actionId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("pipeline_stage_actions")
      .delete()
      .eq("id", args.actionId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for pipeline stage action ${args.actionId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Pipeline stage action deleted from Supabase id=${args.actionId} org=${args.organizationId}`);
    return { success: true, id: args.actionId };
  },
});
