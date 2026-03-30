/**
 * Convex → Supabase Email Event Bindings Write Actions
 *
 * Internal actions that persist email event binding data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeEmailEventBindingToSupabase = internalAction({
  args: {
    emailEventBindingId: v.string(),
    organizationId: v.string(),
    eventType: v.string(),
    templateId: v.string(),
    enabled: v.boolean(),
    priority: v.number(),
    conditions: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.emailEventBindingId,
      organization_id: args.organizationId,
      event_type: args.eventType,
      template_id: args.templateId,
      enabled: args.enabled,
      priority: args.priority,
      conditions: args.conditions ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("email_event_bindings")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for email_event_binding: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`EmailEventBinding written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateEmailEventBindingInSupabase = internalAction({
  args: {
    emailEventBindingId: v.string(),
    organizationId: v.string(),
    templateId: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    priority: v.optional(v.number()),
    conditions: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.templateId !== undefined) row.template_id = args.templateId;
    if (args.enabled !== undefined) row.enabled = args.enabled;
    if (args.priority !== undefined) row.priority = args.priority;
    if (args.conditions !== undefined) row.conditions = args.conditions;

    const { data, error } = await client
      .from("email_event_bindings")
      .update(row)
      .eq("id", args.emailEventBindingId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for email_event_binding ${args.emailEventBindingId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`EmailEventBinding updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteEmailEventBindingFromSupabase = internalAction({
  args: {
    emailEventBindingId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("email_event_bindings")
      .delete()
      .eq("id", args.emailEventBindingId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for email_event_binding ${args.emailEventBindingId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`EmailEventBinding deleted from Supabase id=${args.emailEventBindingId} org=${args.organizationId}`);
    return { success: true, id: args.emailEventBindingId };
  },
});
