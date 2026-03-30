/**
 * Convex → Supabase Document Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeDocumentToSupabase = internalAction({
  args: {
    documentId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    fileId: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    category: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    status: v.optional(v.string()),
    amount: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.documentId,
      organization_id: args.organizationId,
      name: args.name,
      description: args.description ?? null,
      file_id: args.fileId ?? null,
      file_url: args.fileUrl ?? null,
      mime_type: args.mimeType ?? null,
      file_size: args.fileSize ?? null,
      category: args.category ?? null,
      tags: args.tags ?? null,
      tag_ids: args.tagIds ?? null,
      category_id: args.categoryId ?? null,
      status: args.status ?? null,
      amount: args.amount ?? null,
      sent_at: args.sentAt ?? null,
      accepted_at: args.acceptedAt ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("documents")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for document: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Document written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateDocumentInSupabase = internalAction({
  args: {
    documentId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    status: v.optional(v.string()),
    amount: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.description !== undefined) row.description = args.description;
    if (args.category !== undefined) row.category = args.category;
    if (args.tags !== undefined) row.tags = args.tags;
    if (args.tagIds !== undefined) row.tag_ids = args.tagIds;
    if (args.categoryId !== undefined) row.category_id = args.categoryId;
    if (args.status !== undefined) row.status = args.status;
    if (args.amount !== undefined) row.amount = args.amount;
    if (args.sentAt !== undefined) row.sent_at = args.sentAt;
    if (args.acceptedAt !== undefined) row.accepted_at = args.acceptedAt;

    const { data, error } = await client
      .from("documents")
      .update(row)
      .eq("id", args.documentId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for document ${args.documentId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Document updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteDocumentFromSupabase = internalAction({
  args: {
    documentId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("documents")
      .delete()
      .eq("id", args.documentId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for document ${args.documentId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Document deleted from Supabase id=${args.documentId} org=${args.organizationId}`);
    return { success: true, id: args.documentId };
  },
});
