/**
 * Convex → Supabase Company Write Actions
 *
 * Internal actions that persist company data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeCompanyToSupabase = internalAction({
  args: {
    companyId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    domain: v.optional(v.string()),
    industry: v.optional(v.string()),
    size: v.optional(v.string()),
    website: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.any()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
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
      id: args.companyId,
      organization_id: args.organizationId,
      name: args.name,
      domain: args.domain ?? null,
      industry: args.industry ?? null,
      size: args.size ?? null,
      website: args.website ?? null,
      phone: args.phone ?? null,
      address: args.address ?? null,
      notes: args.notes ?? null,
      tags: args.tags ?? null,
      tag_ids: args.tagIds ?? null,
      category_id: args.categoryId ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("companies")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for company: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Company written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateCompanyInSupabase = internalAction({
  args: {
    companyId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    domain: v.optional(v.string()),
    industry: v.optional(v.string()),
    size: v.optional(v.string()),
    website: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.any()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    // Build update payload — only include fields that were provided
    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.domain !== undefined) row.domain = args.domain;
    if (args.industry !== undefined) row.industry = args.industry;
    if (args.size !== undefined) row.size = args.size;
    if (args.website !== undefined) row.website = args.website;
    if (args.phone !== undefined) row.phone = args.phone;
    if (args.address !== undefined) row.address = args.address;
    if (args.notes !== undefined) row.notes = args.notes;
    if (args.tags !== undefined) row.tags = args.tags;
    if (args.tagIds !== undefined) row.tag_ids = args.tagIds;
    if (args.categoryId !== undefined) row.category_id = args.categoryId;

    const { data, error } = await client
      .from("companies")
      .update(row)
      .eq("id", args.companyId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for company ${args.companyId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Company updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteCompanyFromSupabase = internalAction({
  args: {
    companyId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("companies")
      .delete()
      .eq("id", args.companyId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for company ${args.companyId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Company deleted from Supabase id=${args.companyId} org=${args.organizationId}`);
    return { success: true, id: args.companyId };
  },
});
