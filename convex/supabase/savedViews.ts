/**
 * Convex → Supabase Saved View Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeSavedViewToSupabase = internalAction({
  args: {
    viewId: v.string(),
    organizationId: v.string(),
    entityType: v.string(),
    name: v.string(),
    filters: v.optional(v.any()),
    columns: v.optional(v.array(v.string())),
    sortField: v.optional(v.string()),
    sortDirection: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    isSystem: v.boolean(),
    order: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.viewId,
      organization_id: args.organizationId,
      entity_type: args.entityType,
      name: args.name,
      filters: args.filters ?? null,
      columns: args.columns ?? null,
      sort_field: args.sortField ?? null,
      sort_direction: args.sortDirection ?? null,
      is_default: args.isDefault ?? null,
      is_system: args.isSystem,
      order: args.order,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("saved_views")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for saved view: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Saved view written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateSavedViewInSupabase = internalAction({
  args: {
    viewId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    filters: v.optional(v.any()),
    columns: v.optional(v.array(v.string())),
    sortField: v.optional(v.string()),
    sortDirection: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    order: v.optional(v.number()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.filters !== undefined) row.filters = args.filters;
    if (args.columns !== undefined) row.columns = args.columns;
    if (args.sortField !== undefined) row.sort_field = args.sortField;
    if (args.sortDirection !== undefined) row.sort_direction = args.sortDirection;
    if (args.isDefault !== undefined) row.is_default = args.isDefault;
    if (args.order !== undefined) row.order = args.order;

    const { data, error } = await client
      .from("saved_views")
      .update(row)
      .eq("id", args.viewId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for saved view ${args.viewId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Saved view updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteSavedViewFromSupabase = internalAction({
  args: {
    viewId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("saved_views")
      .delete()
      .eq("id", args.viewId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for saved view ${args.viewId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Saved view deleted from Supabase id=${args.viewId} org=${args.organizationId}`);
    return { success: true, id: args.viewId };
  },
});
