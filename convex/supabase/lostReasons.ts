/**
 * Convex → Supabase Lost Reason Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeLostReasonToSupabase = internalAction({
  args: {
    reasonId: v.string(),
    organizationId: v.string(),
    label: v.string(),
    order: v.number(),
    isActive: v.boolean(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.reasonId,
      organization_id: args.organizationId,
      label: args.label,
      order: args.order,
      is_active: args.isActive,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("lost_reasons")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for lost reason: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Lost reason written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateLostReasonInSupabase = internalAction({
  args: {
    reasonId: v.string(),
    organizationId: v.string(),
    label: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    order: v.optional(v.number()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.label !== undefined) row.label = args.label;
    if (args.isActive !== undefined) row.is_active = args.isActive;
    if (args.order !== undefined) row.order = args.order;

    const { data, error } = await client
      .from("lost_reasons")
      .update(row)
      .eq("id", args.reasonId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for lost reason ${args.reasonId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Lost reason updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteLostReasonFromSupabase = internalAction({
  args: {
    reasonId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("lost_reasons")
      .delete()
      .eq("id", args.reasonId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for lost reason ${args.reasonId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Lost reason deleted from Supabase id=${args.reasonId} org=${args.organizationId}`);
    return { success: true, id: args.reasonId };
  },
});
