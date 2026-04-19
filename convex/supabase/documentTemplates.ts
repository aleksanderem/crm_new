/**
 * Convex -> Supabase Document Template Write Actions
 *
 * Internal actions that persist document template data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeDocumentTemplateToSupabase = internalAction({
  args: {
    templateId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    content: v.string(),
    module: v.string(),
    requiredSources: v.array(v.string()),
    requiresSignature: v.boolean(),
    signatureSlots: v.string(),
    accessControl: v.string(),
    version: v.number(),
    parentTemplateId: v.optional(v.string()),
    status: v.string(),
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
      description: args.description ?? null,
      category: args.category,
      content: args.content,
      module: args.module,
      required_sources: args.requiredSources,
      requires_signature: args.requiresSignature,
      signature_slots: JSON.parse(args.signatureSlots),
      access_control: JSON.parse(args.accessControl),
      version: args.version,
      parent_template_id: args.parentTemplateId ?? null,
      status: args.status,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "document_templates", row);

    console.info(`Document template written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateDocumentTemplateInSupabase = internalAction({
  args: {
    templateId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    content: v.optional(v.string()),
    module: v.optional(v.string()),
    requiredSources: v.optional(v.array(v.string())),
    requiresSignature: v.optional(v.boolean()),
    signatureSlots: v.optional(v.string()),
    accessControl: v.optional(v.string()),
    version: v.optional(v.number()),
    status: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.description !== undefined) row.description = args.description;
    if (args.category !== undefined) row.category = args.category;
    if (args.content !== undefined) row.content = args.content;
    if (args.module !== undefined) row.module = args.module;
    if (args.requiredSources !== undefined) row.required_sources = args.requiredSources;
    if (args.requiresSignature !== undefined) row.requires_signature = args.requiresSignature;
    if (args.signatureSlots !== undefined) row.signature_slots = JSON.parse(args.signatureSlots);
    if (args.accessControl !== undefined) row.access_control = JSON.parse(args.accessControl);
    if (args.version !== undefined) row.version = args.version;
    if (args.status !== undefined) row.status = args.status;

    const { data, error } = await client
      .from("document_templates")
      .update(row)
      .eq("id", args.templateId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for document_template ${args.templateId}: ${error.message} (code=${error.code})`;
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

    const { error } = await client
      .from("document_templates")
      .delete()
      .eq("id", args.templateId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for document_template ${args.templateId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Document template deleted from Supabase id=${args.templateId} org=${args.organizationId}`);
    return { success: true, id: args.templateId };
  },
});
