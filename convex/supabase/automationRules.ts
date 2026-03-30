/**
 * Convex → Supabase Automation Rule Write Actions
 *
 * Internal actions that persist automation rule data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 *
 * JSONB columns (trigger, graph, conditions, actions) are passed as-is.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeRule = internalAction({
  args: {
    ruleId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    module: v.string(),
    eventType: v.string(),
    entityType: v.optional(v.string()),
    trigger: v.optional(v.any()),
    graph: v.optional(v.any()),
    definitionVersion: v.optional(v.number()),
    conditions: v.any(),
    actions: v.any(),
    enabled: v.boolean(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.ruleId,
      organization_id: args.organizationId,
      name: args.name,
      description: args.description ?? null,
      module: args.module,
      event_type: args.eventType,
      entity_type: args.entityType ?? null,
      trigger: args.trigger ?? null,
      graph: args.graph ?? null,
      definition_version: args.definitionVersion ?? null,
      conditions: args.conditions,
      actions: args.actions,
      enabled: args.enabled,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("automation_rules")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for automation rule: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Automation rule written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateRule = internalAction({
  args: {
    ruleId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    module: v.optional(v.string()),
    eventType: v.optional(v.string()),
    entityType: v.optional(v.string()),
    trigger: v.optional(v.any()),
    graph: v.optional(v.any()),
    definitionVersion: v.optional(v.number()),
    conditions: v.optional(v.any()),
    actions: v.optional(v.any()),
    enabled: v.optional(v.boolean()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.description !== undefined) row.description = args.description;
    if (args.module !== undefined) row.module = args.module;
    if (args.eventType !== undefined) row.event_type = args.eventType;
    if (args.entityType !== undefined) row.entity_type = args.entityType;
    if (args.trigger !== undefined) row.trigger = args.trigger;
    if (args.graph !== undefined) row.graph = args.graph;
    if (args.definitionVersion !== undefined) row.definition_version = args.definitionVersion;
    if (args.conditions !== undefined) row.conditions = args.conditions;
    if (args.actions !== undefined) row.actions = args.actions;
    if (args.enabled !== undefined) row.enabled = args.enabled;

    const { data, error } = await client
      .from("automation_rules")
      .update(row)
      .eq("id", args.ruleId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for automation rule ${args.ruleId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Automation rule updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteRule = internalAction({
  args: {
    ruleId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("automation_rules")
      .delete()
      .eq("id", args.ruleId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for automation rule ${args.ruleId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Automation rule deleted from Supabase id=${args.ruleId} org=${args.organizationId}`);
    return { success: true, id: args.ruleId };
  },
});
