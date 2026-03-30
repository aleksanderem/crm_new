/**
 * Convex → Supabase Lead Write Actions
 *
 * Internal actions that persist lead data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeLeadToSupabase = internalAction({
  args: {
    leadId: v.string(),
    organizationId: v.string(),
    title: v.string(),
    value: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: v.string(),
    priority: v.optional(v.string()),
    expectedCloseDate: v.optional(v.number()),
    source: v.optional(v.string()),
    companyId: v.optional(v.string()),
    assignedTo: v.optional(v.string()),
    pipelineStageId: v.optional(v.string()),
    stageOrder: v.optional(v.number()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    wonAt: v.optional(v.number()),
    lostAt: v.optional(v.number()),
    lostReason: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.leadId,
      organization_id: args.organizationId,
      title: args.title,
      value: args.value ?? null,
      currency: args.currency ?? null,
      status: args.status,
      priority: args.priority ?? null,
      expected_close_date: args.expectedCloseDate ?? null,
      source: args.source ?? null,
      company_id: args.companyId ?? null,
      assigned_to: args.assignedTo ?? null,
      pipeline_stage_id: args.pipelineStageId ?? null,
      stage_order: args.stageOrder ?? null,
      notes: args.notes ?? null,
      tags: args.tags ?? null,
      tag_ids: args.tagIds ?? null,
      category_id: args.categoryId ?? null,
      won_at: args.wonAt ?? null,
      lost_at: args.lostAt ?? null,
      lost_reason: args.lostReason ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("leads")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for lead: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Lead written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateLeadInSupabase = internalAction({
  args: {
    leadId: v.string(),
    organizationId: v.string(),
    title: v.optional(v.string()),
    value: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
    expectedCloseDate: v.optional(v.number()),
    source: v.optional(v.string()),
    companyId: v.optional(v.string()),
    assignedTo: v.optional(v.string()),
    pipelineStageId: v.optional(v.string()),
    stageOrder: v.optional(v.number()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    wonAt: v.optional(v.number()),
    lostAt: v.optional(v.number()),
    lostReason: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.title !== undefined) row.title = args.title;
    if (args.value !== undefined) row.value = args.value;
    if (args.currency !== undefined) row.currency = args.currency;
    if (args.status !== undefined) row.status = args.status;
    if (args.priority !== undefined) row.priority = args.priority;
    if (args.expectedCloseDate !== undefined) row.expected_close_date = args.expectedCloseDate;
    if (args.source !== undefined) row.source = args.source;
    if (args.companyId !== undefined) row.company_id = args.companyId;
    if (args.assignedTo !== undefined) row.assigned_to = args.assignedTo;
    if (args.pipelineStageId !== undefined) row.pipeline_stage_id = args.pipelineStageId;
    if (args.stageOrder !== undefined) row.stage_order = args.stageOrder;
    if (args.notes !== undefined) row.notes = args.notes;
    if (args.tags !== undefined) row.tags = args.tags;
    if (args.tagIds !== undefined) row.tag_ids = args.tagIds;
    if (args.categoryId !== undefined) row.category_id = args.categoryId;
    if (args.wonAt !== undefined) row.won_at = args.wonAt;
    if (args.lostAt !== undefined) row.lost_at = args.lostAt;
    if (args.lostReason !== undefined) row.lost_reason = args.lostReason;

    const { data, error } = await client
      .from("leads")
      .update(row)
      .eq("id", args.leadId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for lead ${args.leadId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Lead updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteLeadFromSupabase = internalAction({
  args: {
    leadId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("leads")
      .delete()
      .eq("id", args.leadId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for lead ${args.leadId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Lead deleted from Supabase id=${args.leadId} org=${args.organizationId}`);
    return { success: true, id: args.leadId };
  },
});
