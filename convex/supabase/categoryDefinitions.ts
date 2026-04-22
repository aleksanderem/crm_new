/**
 * Convex → Supabase CategoryDefinitions Dual-Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeCategoryDefinitionToSupabase = internalAction({
  args: {
    categoryDefinitionId: v.string(),
    organizationId: v.string(),
    entityType: v.string(),
    name: v.string(),
    parentId: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    sortOrder: v.number(),
    isDeleted: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();

    const row = {
      id: args.categoryDefinitionId,
      organization_id: args.organizationId,
      entity_type: args.entityType,
      name: args.name,
      parent_id: args.parentId ?? null,
      color: args.color ?? null,
      icon: args.icon ?? null,
      sort_order: args.sortOrder,
      is_deleted: args.isDeleted ?? null,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "category_definitions", row);

    console.info(`CategoryDefinition written to Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});

export const updateCategoryDefinitionInSupabase = internalAction({
  args: {
    categoryDefinitionId: v.string(),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    parentId: v.optional(v.string()),
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
    if (args.parentId !== undefined) row.parent_id = args.parentId;
    if (args.isDeleted !== undefined) row.is_deleted = args.isDeleted;

    const { data, error } = await client
      .from("category_definitions")
      .update(row)
      .eq("id", args.categoryDefinitionId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for categoryDefinition ${args.categoryDefinitionId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`CategoryDefinition updated in Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});
