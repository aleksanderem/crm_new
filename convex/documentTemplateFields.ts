import { query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { verifyOrgAccess } from "./_helpers/auth";

// Dual-write refs removed — Supabase is now primary for template field writes

const fieldTypeValidator = v.union(
  v.literal("text"),
  v.literal("textarea"),
  v.literal("number"),
  v.literal("date"),
  v.literal("select"),
  v.literal("checkbox"),
  v.literal("signature"),
  v.literal("currency"),
  v.literal("phone"),
  v.literal("email"),
  v.literal("pesel"),
);

const bindingValidator = v.object({
  source: v.string(),
  field: v.string(),
});

const validationValidator = v.object({
  required: v.optional(v.boolean()),
  min: v.optional(v.number()),
  max: v.optional(v.number()),
  pattern: v.optional(v.string()),
  minLength: v.optional(v.number()),
  maxLength: v.optional(v.number()),
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const listByTemplate = query({
  args: { templateId: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) return [];
    await verifyOrgAccess(ctx, template.organizationId);

    const fields = await ctx.db
      .query("documentTemplateFields")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .collect();

    return fields.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

// ---------------------------------------------------------------------------
// Actions (Supabase-primary)
// ---------------------------------------------------------------------------

export const create = action({
  args: {
    templateId: v.string(),
    fieldKey: v.string(),
    label: v.string(),
    type: fieldTypeValidator,
    sortOrder: v.number(),
    group: v.optional(v.string()),
    options: v.optional(v.array(v.object({ label: v.string(), value: v.string() }))),
    defaultValue: v.optional(v.string()),
    binding: v.optional(bindingValidator),
    validation: v.optional(validationValidator),
    placeholder: v.optional(v.string()),
    helpText: v.optional(v.string()),
    width: v.union(v.literal("full"), v.literal("half")),
  },
  handler: async (ctx, args) => {
    // Verify org access via template lookup (needs Convex db)
    const orgId = await ctx.runMutation(internal.documentTemplateFields._verifyTemplateAccess, {
      templateId: args.templateId,
    });

    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: orgId },
    );

    const db = createSupabaseDb();

    // Check fieldKey uniqueness
    const existing = await db.query("documentTemplateFields")
      .eq("templateId", args.templateId)
      .eq("fieldKey", args.fieldKey)
      .first();
    if (existing) throw new Error(`Field key "${args.fieldKey}" already exists in this template`);

    const fieldId = await db.insert("documentTemplateFields", {
      templateId: args.templateId,
      fieldKey: args.fieldKey,
      label: args.label,
      type: args.type,
      sortOrder: args.sortOrder,
      group: args.group ?? null,
      options: args.options ? JSON.stringify(args.options) : null,
      defaultValue: args.defaultValue ?? null,
      binding: args.binding ? JSON.stringify(args.binding) : null,
      validation: args.validation ? JSON.stringify(args.validation) : null,
      placeholder: args.placeholder ?? null,
      helpText: args.helpText ?? null,
      width: args.width,
    });

    return fieldId;
  },
});

export const _verifyTemplateAccess = internalMutation({
  args: { templateId: v.string() },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId as Id<"documentTemplates">);
    if (!template) throw new Error("Template not found");
    return template.organizationId;
  },
});

export const update = action({
  args: {
    id: v.string(),
    fieldKey: v.optional(v.string()),
    label: v.optional(v.string()),
    type: v.optional(fieldTypeValidator),
    sortOrder: v.optional(v.number()),
    group: v.optional(v.string()),
    options: v.optional(v.array(v.object({ label: v.string(), value: v.string() }))),
    defaultValue: v.optional(v.string()),
    binding: v.optional(bindingValidator),
    validation: v.optional(validationValidator),
    placeholder: v.optional(v.string()),
    helpText: v.optional(v.string()),
    width: v.optional(v.union(v.literal("full"), v.literal("half"))),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const field = await db.get("documentTemplateFields", args.id);
    if (!field) throw new Error("Field not found");

    // Verify org access via template
    const orgId = await ctx.runMutation(internal.documentTemplateFields._verifyTemplateAccess, {
      templateId: field.templateId as string,
    });

    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: orgId },
    );

    // Check fieldKey uniqueness if changing
    if (args.fieldKey && args.fieldKey !== field.fieldKey) {
      const existing = await db.query("documentTemplateFields")
        .eq("templateId", field.templateId as string)
        .eq("fieldKey", args.fieldKey)
        .first();
      if (existing) throw new Error(`Field key "${args.fieldKey}" already exists in this template`);
    }

    const { id, ...patch } = args;
    const cleaned: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) {
        if (k === "options" || k === "binding" || k === "validation") {
          cleaned[k] = JSON.stringify(val);
        } else {
          cleaned[k] = val;
        }
      }
    }

    await db.patch("documentTemplateFields", args.id, cleaned);
  },
});

export const remove = action({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const field = await db.get("documentTemplateFields", args.id);
    if (!field) throw new Error("Field not found");

    // Verify org access via template
    const orgId = await ctx.runMutation(internal.documentTemplateFields._verifyTemplateAccess, {
      templateId: field.templateId as string,
    });

    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: orgId },
    );

    await db.delete("documentTemplateFields", args.id);
  },
});

export const reorder = action({
  args: {
    templateId: v.string(),
    fieldIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify org access via template
    const orgId = await ctx.runMutation(internal.documentTemplateFields._verifyTemplateAccess, {
      templateId: args.templateId,
    });

    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: orgId },
    );

    const db = createSupabaseDb();
    for (let i = 0; i < args.fieldIds.length; i++) {
      await db.patch("documentTemplateFields", args.fieldIds[i], { sortOrder: i });
    }
  },
});
