/**
 * Convex -> Supabase Document Template Field Write Actions
 *
 * Internal actions that persist document template field data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeDocumentTemplateFieldToSupabase = internalAction({
  args: {
    fieldId: v.string(),
    templateId: v.string(),
    fieldKey: v.string(),
    label: v.string(),
    type: v.string(),
    sortOrder: v.number(),
    group: v.optional(v.string()),
    options: v.optional(v.string()),
    defaultValue: v.optional(v.string()),
    binding: v.optional(v.string()),
    validation: v.optional(v.string()),
    placeholder: v.optional(v.string()),
    helpText: v.optional(v.string()),
    width: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.fieldId,
      template_id: args.templateId,
      field_key: args.fieldKey,
      label: args.label,
      type: args.type,
      sort_order: args.sortOrder,
      group: args.group ?? null,
      options: args.options ? JSON.parse(args.options) : null,
      default_value: args.defaultValue ?? null,
      binding: args.binding ? JSON.parse(args.binding) : null,
      validation: args.validation ? JSON.parse(args.validation) : null,
      placeholder: args.placeholder ?? null,
      help_text: args.helpText ?? null,
      width: args.width,
    };

    const data = await upsertWithFkRetry(client, "document_template_fields", row);

    console.info(`Document template field written to Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});

export const deleteDocumentTemplateFieldFromSupabase = internalAction({
  args: {
    fieldId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("document_template_fields")
      .delete()
      .eq("id", args.fieldId);

    if (error) {
      const msg = `Supabase delete failed for document_template_field ${args.fieldId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Document template field deleted from Supabase id=${args.fieldId}`);
    return { success: true, id: args.fieldId };
  },
});
