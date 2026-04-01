/**
 * Convex → Supabase Document & Template Write Actions
 *
 * Internal actions that persist gabinet document and document template data
 * to PostgreSQL via Supabase service-role client (bypasses RLS).
 * Dual-write pattern: Convex mutations write to Convex first, then schedule
 * these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "../client";

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const writeDocumentToSupabase = internalAction({
  args: {
    documentId: v.string(),
    organizationId: v.string(),
    patientId: v.string(),
    appointmentId: v.optional(v.string()),
    templateId: v.optional(v.string()),
    title: v.string(),
    type: v.string(),
    content: v.string(),
    status: v.string(),
    signatureData: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    signedByPatient: v.optional(v.boolean()),
    signedByEmployee: v.optional(v.string()),
    fileStorageId: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileMimeType: v.optional(v.string()),
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
      id: args.documentId,
      organization_id: args.organizationId,
      patient_id: args.patientId,
      appointment_id: args.appointmentId ?? null,
      template_id: args.templateId ?? null,
      title: args.title,
      type: args.type,
      content: args.content,
      status: args.status,
      signature_data: args.signatureData ?? null,
      signed_at: args.signedAt ?? null,
      signed_by_patient: args.signedByPatient ?? null,
      signed_by_employee: args.signedByEmployee ?? null,
      file_storage_id: args.fileStorageId ?? null,
      file_name: args.fileName ?? null,
      file_mime_type: args.fileMimeType ?? null,
      tag_ids: args.tagIds ?? null,
      category_id: args.categoryId ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("gabinet_documents")
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
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    status: v.optional(v.string()),
    signatureData: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    signedByPatient: v.optional(v.boolean()),
    signedByEmployee: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.title !== undefined) row.title = args.title;
    if (args.content !== undefined) row.content = args.content;
    if (args.status !== undefined) row.status = args.status;
    if (args.signatureData !== undefined) row.signature_data = args.signatureData;
    if (args.signedAt !== undefined) row.signed_at = args.signedAt;
    if (args.signedByPatient !== undefined) row.signed_by_patient = args.signedByPatient;
    if (args.signedByEmployee !== undefined) row.signed_by_employee = args.signedByEmployee;
    if (args.tagIds !== undefined) row.tag_ids = args.tagIds;
    if (args.categoryId !== undefined) row.category_id = args.categoryId;

    const { data, error } = await client
      .from("gabinet_documents")
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

    // Soft-delete: set status to archived
    const { error } = await client
      .from("gabinet_documents")
      .update({ status: "archived", updated_at: Date.now() })
      .eq("id", args.documentId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for document ${args.documentId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Document soft-deleted in Supabase id=${args.documentId} org=${args.organizationId}`);
    return { success: true, id: args.documentId };
  },
});

// ---------------------------------------------------------------------------
// Document Templates
// ---------------------------------------------------------------------------

export const writeDocumentTemplateToSupabase = internalAction({
  args: {
    templateId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    type: v.string(),
    content: v.string(),
    requiresSignature: v.boolean(),
    isActive: v.boolean(),
    sortOrder: v.optional(v.number()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.templateId,
      organization_id: args.organizationId,
      name: args.name,
      type: args.type,
      content: args.content,
      requires_signature: args.requiresSignature,
      is_active: args.isActive,
      sort_order: args.sortOrder ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("gabinet_document_templates")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for document template: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Document template written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateDocumentTemplateInSupabase = internalAction({
  args: {
    templateId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    type: v.optional(v.string()),
    content: v.optional(v.string()),
    requiresSignature: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.type !== undefined) row.type = args.type;
    if (args.content !== undefined) row.content = args.content;
    if (args.requiresSignature !== undefined) row.requires_signature = args.requiresSignature;
    if (args.isActive !== undefined) row.is_active = args.isActive;
    if (args.sortOrder !== undefined) row.sort_order = args.sortOrder;

    const { data, error } = await client
      .from("gabinet_document_templates")
      .update(row)
      .eq("id", args.templateId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for document template ${args.templateId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Document template updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteDocumentTemplateFromSupabase = internalAction({
  args: {
    templateId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    // Soft-delete: set is_active = false
    const { error } = await client
      .from("gabinet_document_templates")
      .update({ is_active: false, updated_at: Date.now() })
      .eq("id", args.templateId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for document template ${args.templateId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Document template soft-deleted in Supabase id=${args.templateId} org=${args.organizationId}`);
    return { success: true, id: args.templateId };
  },
});
