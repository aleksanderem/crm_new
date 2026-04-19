/**
 * Convex → Supabase TagDefinitions Dual-Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeTagDefinitionToSupabase = internalAction({
  args: {
    tagDefinitionId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    color: v.string(),
    sortOrder: v.number(),
    isDeleted: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();

    const row = {
      id: args.tagDefinitionId,
      organization_id: args.organizationId,
      name: args.name,
      color: args.color,
      sort_order: args.sortOrder,
      is_deleted: args.isDeleted ?? null,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "tag_definitions", row);

    console.info(`TagDefinition written to Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});

export const updateTagDefinitionInSupabase = internalAction({
  args: {
    tagDefinitionId: v.string(),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    isDeleted: v.optional(v.boolean()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = {
      updated_at: args.updatedAt,
    };
    if (args.name !== undefined) row.name = args.name;
    if (args.color !== undefined) row.color = args.color;
    if (args.isDeleted !== undefined) row.is_deleted = args.isDeleted;

    const { data, error } = await client
      .from("tag_definitions")
      .update(row)
      .eq("id", args.tagDefinitionId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for tagDefinition ${args.tagDefinitionId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`TagDefinition updated in Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});
