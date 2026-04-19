/**
 * Convex → Supabase Contact Write Action
 *
 * Internal action that persists a contact to PostgreSQL via the Supabase
 * service-role client (bypasses RLS). Used by the dual-write pattern:
 * Convex mutations write to Convex first, then call this action to replicate
 * the contact to Supabase.
 *
 * This is an internalAction — only callable from other Convex functions,
 * not directly from the frontend.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeContactToSupabase = internalAction({
  args: {
    contactId: v.string(),
    organizationId: v.string(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
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

    // Map camelCase args → snake_case PostgreSQL columns
    const row = {
      id: args.contactId,
      organization_id: args.organizationId,
      first_name: args.firstName,
      last_name: args.lastName ?? null,
      email: args.email ?? null,
      phone: args.phone ?? null,
      title: args.title ?? null,
      avatar_url: args.avatarUrl ?? null,
      notes: args.notes ?? null,
      tags: args.tags ?? null,
      tag_ids: args.tagIds ?? null,
      category_id: args.categoryId ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "contacts", row);

    console.info(
      `Contact written to Supabase id=${data.id} org=${args.organizationId}`,
    );

    return { success: true, id: data.id };
  },
});

/**
 * Updates an existing contact in Supabase PostgreSQL.
 * Called via ctx.scheduler.runAfter from the Convex update mutation (dual-write).
 */
export const updateContactInSupabase = internalAction({
  args: {
    contactId: v.string(),
    organizationId: v.string(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
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
      first_name: args.firstName,
      last_name: args.lastName ?? null,
      email: args.email ?? null,
      phone: args.phone ?? null,
      title: args.title ?? null,
      avatar_url: args.avatarUrl ?? null,
      notes: args.notes ?? null,
      tags: args.tags ?? null,
      tag_ids: args.tagIds ?? null,
      category_id: args.categoryId ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("contacts")
      .update(row)
      .eq("id", args.contactId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for contact ${args.contactId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error(
        "Supabase update returned malformed response: missing id in response data",
      );
    }

    console.info(
      `Contact updated in Supabase id=${data.id} org=${args.organizationId}`,
    );

    return { success: true, id: data.id };
  },
});

/**
 * Deletes a contact from Supabase PostgreSQL.
 * Called via ctx.scheduler.runAfter from the Convex remove mutation (dual-write).
 */
export const deleteContactFromSupabase = internalAction({
  args: {
    contactId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("contacts")
      .delete()
      .eq("id", args.contactId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for contact ${args.contactId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(
      `Contact deleted from Supabase id=${args.contactId} org=${args.organizationId}`,
    );

    return { success: true, id: args.contactId };
  },
});
