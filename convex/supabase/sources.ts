/**
 * Convex → Supabase Source Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeSourceToSupabase = internalAction({
  args: {
    sourceId: v.string(),
    organizationId: v.string(),
    name: v.string(),
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
      id: args.sourceId,
      organization_id: args.organizationId,
      name: args.name,
      order: args.order,
      is_active: args.isActive,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("sources")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for source: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Source written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateSourceInSupabase = internalAction({
  args: {
    sourceId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    order: v.optional(v.number()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.isActive !== undefined) row.is_active = args.isActive;
    if (args.order !== undefined) row.order = args.order;

    const { data, error } = await client
      .from("sources")
      .update(row)
      .eq("id", args.sourceId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for source ${args.sourceId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Source updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteSourceFromSupabase = internalAction({
  args: {
    sourceId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("sources")
      .delete()
      .eq("id", args.sourceId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for source ${args.sourceId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Source deleted from Supabase id=${args.sourceId} org=${args.organizationId}`);
    return { success: true, id: args.sourceId };
  },
});
