/**
 * Convex -> Supabase Form Template Write Actions
 *
 * Internal actions that persist form template data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeFormTemplateToSupabase = internalAction({
  args: {
    templateId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    folderPath: v.optional(v.string()),
    templateType: v.optional(v.string()),
    formJson: v.string(),
    contentJson: v.optional(v.string()),
    modules: v.array(v.string()),
    entityTypes: v.array(v.string()),
    variableBindings: v.optional(v.string()),
    requiresSignature: v.boolean(),
    signatureConfig: v.optional(v.string()),
    accessRoles: v.optional(v.array(v.string())),
    version: v.number(),
    isActive: v.boolean(),
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
      folder_path: args.folderPath ?? null,
      template_type: args.templateType ?? null,
      form_json: args.formJson,
      content_json: args.contentJson ?? null,
      modules: args.modules,
      entity_types: args.entityTypes,
      variable_bindings: args.variableBindings ?? null,
      requires_signature: args.requiresSignature,
      signature_config: args.signatureConfig ? JSON.parse(args.signatureConfig) : null,
      access_roles: args.accessRoles ?? null,
      version: args.version,
      is_active: args.isActive,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("form_templates")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for form_template: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Form template written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateFormTemplateInSupabase = internalAction({
  args: {
    templateId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    folderPath: v.optional(v.string()),
    templateType: v.optional(v.string()),
    formJson: v.optional(v.string()),
    contentJson: v.optional(v.string()),
    modules: v.optional(v.array(v.string())),
    entityTypes: v.optional(v.array(v.string())),
    variableBindings: v.optional(v.string()),
    requiresSignature: v.optional(v.boolean()),
    signatureConfig: v.optional(v.string()),
    accessRoles: v.optional(v.array(v.string())),
    version: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.description !== undefined) row.description = args.description;
    if (args.category !== undefined) row.category = args.category;
    if (args.folderPath !== undefined) row.folder_path = args.folderPath;
    if (args.templateType !== undefined) row.template_type = args.templateType;
    if (args.formJson !== undefined) row.form_json = args.formJson;
    if (args.contentJson !== undefined) row.content_json = args.contentJson;
    if (args.modules !== undefined) row.modules = args.modules;
    if (args.entityTypes !== undefined) row.entity_types = args.entityTypes;
    if (args.variableBindings !== undefined) row.variable_bindings = args.variableBindings;
    if (args.requiresSignature !== undefined) row.requires_signature = args.requiresSignature;
    if (args.signatureConfig !== undefined) row.signature_config = JSON.parse(args.signatureConfig);
    if (args.accessRoles !== undefined) row.access_roles = args.accessRoles;
    if (args.version !== undefined) row.version = args.version;
    if (args.isActive !== undefined) row.is_active = args.isActive;

    const { data, error } = await client
      .from("form_templates")
      .update(row)
      .eq("id", args.templateId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for form_template ${args.templateId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Form template updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteFormTemplateFromSupabase = internalAction({
  args: {
    templateId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("form_templates")
      .delete()
      .eq("id", args.templateId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for form_template ${args.templateId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Form template deleted from Supabase id=${args.templateId} org=${args.organizationId}`);
    return { success: true, id: args.templateId };
  },
});
