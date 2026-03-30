/**
 * Convex → Supabase Email Event Types Write Actions
 *
 * Internal actions that persist email event type data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeEmailEventTypeToSupabase = internalAction({
  args: {
    emailEventTypeId: v.string(),
    organizationId: v.string(),
    eventType: v.string(),
    module: v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
    payloadSchema: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.emailEventTypeId,
      organization_id: args.organizationId,
      event_type: args.eventType,
      module: args.module,
      display_name: args.displayName,
      description: args.description ?? null,
      payload_schema: args.payloadSchema ?? null,
      is_active: args.isActive,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("email_event_types")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for email_event_type: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`EmailEventType written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateEmailEventTypeInSupabase = internalAction({
  args: {
    emailEventTypeId: v.string(),
    organizationId: v.string(),
    displayName: v.optional(v.string()),
    description: v.optional(v.string()),
    payloadSchema: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.displayName !== undefined) row.display_name = args.displayName;
    if (args.description !== undefined) row.description = args.description;
    if (args.payloadSchema !== undefined) row.payload_schema = args.payloadSchema;
    if (args.isActive !== undefined) row.is_active = args.isActive;

    const { data, error } = await client
      .from("email_event_types")
      .update(row)
      .eq("id", args.emailEventTypeId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for email_event_type ${args.emailEventTypeId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`EmailEventType updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteEmailEventTypeFromSupabase = internalAction({
  args: {
    emailEventTypeId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("email_event_types")
      .delete()
      .eq("id", args.emailEventTypeId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for email_event_type ${args.emailEventTypeId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`EmailEventType deleted from Supabase id=${args.emailEventTypeId} org=${args.organizationId}`);
    return { success: true, id: args.emailEventTypeId };
  },
});
