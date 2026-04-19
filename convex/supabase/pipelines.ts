/**
 * Convex → Supabase Pipeline & Stage Write Actions
 *
 * Internal actions that persist pipeline and pipeline stage data to
 * PostgreSQL via Supabase service-role client (bypasses RLS).
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

// ── Pipeline Actions ──────────────────────────────────────────────────────────

export const writePipelineToSupabase = internalAction({
  args: {
    pipelineId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    type: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.pipelineId,
      organization_id: args.organizationId,
      name: args.name,
      description: args.description ?? null,
      type: args.type ?? null,
      is_default: args.isDefault ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "pipelines", row);

    console.info(`Pipeline written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updatePipelineInSupabase = internalAction({
  args: {
    pipelineId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    type: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.description !== undefined) row.description = args.description;
    if (args.type !== undefined) row.type = args.type;
    if (args.isDefault !== undefined) row.is_default = args.isDefault;

    const { data, error } = await client
      .from("pipelines")
      .update(row)
      .eq("id", args.pipelineId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for pipeline ${args.pipelineId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Pipeline updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deletePipelineFromSupabase = internalAction({
  args: {
    pipelineId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("pipelines")
      .delete()
      .eq("id", args.pipelineId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for pipeline ${args.pipelineId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Pipeline deleted from Supabase id=${args.pipelineId} org=${args.organizationId}`);
    return { success: true, id: args.pipelineId };
  },
});

// ── Pipeline Stage Actions ────────────────────────────────────────────────────

export const writeStageToSupabase = internalAction({
  args: {
    stageId: v.string(),
    pipelineId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    color: v.optional(v.string()),
    order: v.number(),
    isWonStage: v.optional(v.boolean()),
    isLostStage: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.stageId,
      pipeline_id: args.pipelineId,
      organization_id: args.organizationId,
      name: args.name,
      color: args.color ?? null,
      order: args.order,
      is_won_stage: args.isWonStage ?? null,
      is_lost_stage: args.isLostStage ?? null,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "pipeline_stages", row);

    console.info(`Pipeline stage written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateStageInSupabase = internalAction({
  args: {
    stageId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    order: v.optional(v.number()),
    isWonStage: v.optional(v.boolean()),
    isLostStage: v.optional(v.boolean()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.color !== undefined) row.color = args.color;
    if (args.order !== undefined) row.order = args.order;
    if (args.isWonStage !== undefined) row.is_won_stage = args.isWonStage;
    if (args.isLostStage !== undefined) row.is_lost_stage = args.isLostStage;

    const { data, error } = await client
      .from("pipeline_stages")
      .update(row)
      .eq("id", args.stageId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for pipeline stage ${args.stageId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Pipeline stage updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteStageFromSupabase = internalAction({
  args: {
    stageId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("pipeline_stages")
      .delete()
      .eq("id", args.stageId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for pipeline stage ${args.stageId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Pipeline stage deleted from Supabase id=${args.stageId} org=${args.organizationId}`);
    return { success: true, id: args.stageId };
  },
});
