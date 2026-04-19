/**
 * Convex -> Supabase Document Instance Write Actions
 *
 * Internal actions that persist document instance data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeDocumentInstanceToSupabase = internalAction({
  args: {
    instanceId: v.string(),
    organizationId: v.string(),
    type: v.optional(v.string()),
    templateId: v.optional(v.string()),
    templateVersion: v.optional(v.number()),
    title: v.string(),
    renderedContent: v.optional(v.string()),
    fieldValues: v.optional(v.string()),
    resolvedSources: v.optional(v.string()),
    fileId: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    category: v.optional(v.string()),
    status: v.string(),
    module: v.optional(v.string()),
    signatures: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.instanceId,
      organization_id: args.organizationId,
      type: args.type ?? null,
      template_id: args.templateId ?? null,
      template_version: args.templateVersion ?? null,
      title: args.title,
      rendered_content: args.renderedContent ?? null,
      field_values: args.fieldValues ? JSON.parse(args.fieldValues) : null,
      resolved_sources: args.resolvedSources ? JSON.parse(args.resolvedSources) : null,
      file_id: args.fileId ?? null,
      file_url: args.fileUrl ?? null,
      file_name: args.fileName ?? null,
      mime_type: args.mimeType ?? null,
      file_size: args.fileSize ?? null,
      category: args.category ?? null,
      status: args.status,
      module: args.module ?? null,
      signatures: JSON.parse(args.signatures),
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "document_instances", row);

    console.info(`Document instance written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateDocumentInstanceInSupabase = internalAction({
  args: {
    instanceId: v.string(),
    organizationId: v.string(),
    title: v.optional(v.string()),
    renderedContent: v.optional(v.string()),
    fieldValues: v.optional(v.string()),
    status: v.optional(v.string()),
    category: v.optional(v.string()),
    fileId: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    signatures: v.optional(v.string()),
    assignedReviewerId: v.optional(v.string()),
    assignedReviewerName: v.optional(v.string()),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    approvedBy: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.title !== undefined) row.title = args.title;
    if (args.renderedContent !== undefined) row.rendered_content = args.renderedContent;
    if (args.fieldValues !== undefined) row.field_values = JSON.parse(args.fieldValues);
    if (args.status !== undefined) row.status = args.status;
    if (args.category !== undefined) row.category = args.category;
    if (args.fileId !== undefined) row.file_id = args.fileId;
    if (args.fileUrl !== undefined) row.file_url = args.fileUrl;
    if (args.fileName !== undefined) row.file_name = args.fileName;
    if (args.mimeType !== undefined) row.mime_type = args.mimeType;
    if (args.fileSize !== undefined) row.file_size = args.fileSize;
    if (args.signatures !== undefined) row.signatures = JSON.parse(args.signatures);
    if (args.assignedReviewerId !== undefined) row.assigned_reviewer_id = args.assignedReviewerId;
    if (args.assignedReviewerName !== undefined) row.assigned_reviewer_name = args.assignedReviewerName;
    if (args.reviewedBy !== undefined) row.reviewed_by = args.reviewedBy;
    if (args.reviewedAt !== undefined) row.reviewed_at = args.reviewedAt;
    if (args.approvedBy !== undefined) row.approved_by = args.approvedBy;
    if (args.approvedAt !== undefined) row.approved_at = args.approvedAt;

    const { data, error } = await client
      .from("document_instances")
      .update(row)
      .eq("id", args.instanceId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for document_instance ${args.instanceId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Document instance updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteDocumentInstanceFromSupabase = internalAction({
  args: {
    instanceId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("document_instances")
      .delete()
      .eq("id", args.instanceId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for document_instance ${args.instanceId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Document instance deleted from Supabase id=${args.instanceId} org=${args.organizationId}`);
    return { success: true, id: args.instanceId };
  },
});
