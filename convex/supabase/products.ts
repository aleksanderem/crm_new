/**
 * Convex → Supabase Product Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeProductToSupabase = internalAction({
  args: {
    productId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    sku: v.string(),
    unitPrice: v.number(),
    taxRate: v.number(),
    isActive: v.boolean(),
    description: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.productId,
      organization_id: args.organizationId,
      name: args.name,
      sku: args.sku,
      unit_price: args.unitPrice,
      tax_rate: args.taxRate,
      is_active: args.isActive,
      description: args.description ?? null,
      tag_ids: args.tagIds ?? null,
      category_id: args.categoryId ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "products", row);

    console.info(`Product written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateProductInSupabase = internalAction({
  args: {
    productId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    sku: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    taxRate: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    description: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.sku !== undefined) row.sku = args.sku;
    if (args.unitPrice !== undefined) row.unit_price = args.unitPrice;
    if (args.taxRate !== undefined) row.tax_rate = args.taxRate;
    if (args.isActive !== undefined) row.is_active = args.isActive;
    if (args.description !== undefined) row.description = args.description;
    if (args.tagIds !== undefined) row.tag_ids = args.tagIds;
    if (args.categoryId !== undefined) row.category_id = args.categoryId;

    const { data, error } = await client
      .from("products")
      .update(row)
      .eq("id", args.productId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for product ${args.productId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Product updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteProductFromSupabase = internalAction({
  args: {
    productId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("products")
      .delete()
      .eq("id", args.productId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for product ${args.productId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Product deleted from Supabase id=${args.productId} org=${args.organizationId}`);
    return { success: true, id: args.productId };
  },
});
