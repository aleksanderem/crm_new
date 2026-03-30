/**
 * Convex → Supabase Email Template Write Actions
 *
 * Internal actions that persist email template data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeEmailTemplateToSupabase = internalAction({
  args: {
    templateId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    subject: v.string(),
    body: v.string(),
    contentJson: v.optional(v.string()),
    renderedHtml: v.optional(v.string()),
    slug: v.optional(v.string()),
    category: v.optional(v.string()),
    module: v.optional(v.string()),
    eventType: v.optional(v.string()),
    isSystem: v.optional(v.boolean()),
    locale: v.optional(v.string()),
    requiredSources: v.optional(v.array(v.string())),
    variables: v.any(),
    createdBy: v.string(),
    isActive: v.boolean(),
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
      subject: args.subject,
      body: args.body,
      content_json: args.contentJson ?? null,
      rendered_html: args.renderedHtml ?? null,
      slug: args.slug ?? null,
      category: args.category ?? null,
      module: args.module ?? null,
      event_type: args.eventType ?? null,
      is_system: args.isSystem ?? null,
      locale: args.locale ?? null,
      required_sources: args.requiredSources ?? null,
      variables: args.variables,
      created_by: args.createdBy,
      is_active: args.isActive,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("email_templates")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for email_template: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`EmailTemplate written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateEmailTemplateInSupabase = internalAction({
  args: {
    templateId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
    contentJson: v.optional(v.string()),
    renderedHtml: v.optional(v.string()),
    slug: v.optional(v.string()),
    category: v.optional(v.string()),
    module: v.optional(v.string()),
    eventType: v.optional(v.string()),
    isSystem: v.optional(v.boolean()),
    locale: v.optional(v.string()),
    requiredSources: v.optional(v.array(v.string())),
    variables: v.optional(v.any()),
    isActive: v.optional(v.boolean()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.subject !== undefined) row.subject = args.subject;
    if (args.body !== undefined) row.body = args.body;
    if (args.contentJson !== undefined) row.content_json = args.contentJson;
    if (args.renderedHtml !== undefined) row.rendered_html = args.renderedHtml;
    if (args.slug !== undefined) row.slug = args.slug;
    if (args.category !== undefined) row.category = args.category;
    if (args.module !== undefined) row.module = args.module;
    if (args.eventType !== undefined) row.event_type = args.eventType;
    if (args.isSystem !== undefined) row.is_system = args.isSystem;
    if (args.locale !== undefined) row.locale = args.locale;
    if (args.requiredSources !== undefined) row.required_sources = args.requiredSources;
    if (args.variables !== undefined) row.variables = args.variables;
    if (args.isActive !== undefined) row.is_active = args.isActive;

    const { data, error } = await client
      .from("email_templates")
      .update(row)
      .eq("id", args.templateId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for email_template ${args.templateId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`EmailTemplate updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteEmailTemplateFromSupabase = internalAction({
  args: {
    templateId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("email_templates")
      .delete()
      .eq("id", args.templateId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for email_template ${args.templateId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`EmailTemplate deleted from Supabase id=${args.templateId} org=${args.organizationId}`);
    return { success: true, id: args.templateId };
  },
});
