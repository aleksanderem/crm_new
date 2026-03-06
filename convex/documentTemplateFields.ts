import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

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
// Mutations
// ---------------------------------------------------------------------------

export const create = mutation({
  args: {
    templateId: v.id("documentTemplates"),
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
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");
    await verifyOrgAccess(ctx, template.organizationId);

    // Check fieldKey uniqueness within template
    const existing = await ctx.db
      .query("documentTemplateFields")
      .withIndex("by_templateAndKey", (q) =>
        q.eq("templateId", args.templateId).eq("fieldKey", args.fieldKey),
      )
      .unique();
    if (existing) throw new Error(`Field key "${args.fieldKey}" already exists in this template`);

    return await ctx.db.insert("documentTemplateFields", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("documentTemplateFields"),
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
    const field = await ctx.db.get(args.id);
    if (!field) throw new Error("Field not found");
    const template = await ctx.db.get(field.templateId);
    if (!template) throw new Error("Template not found");
    await verifyOrgAccess(ctx, template.organizationId);

    // Check fieldKey uniqueness if changing
    if (args.fieldKey && args.fieldKey !== field.fieldKey) {
      const existing = await ctx.db
        .query("documentTemplateFields")
        .withIndex("by_templateAndKey", (q) =>
          q.eq("templateId", field.templateId).eq("fieldKey", args.fieldKey!),
        )
        .unique();
      if (existing) throw new Error(`Field key "${args.fieldKey}" already exists in this template`);
    }

    const { id, ...patch } = args;
    const cleaned: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) cleaned[k] = val;
    }

    await ctx.db.patch(args.id, cleaned);
  },
});

export const remove = mutation({
  args: { id: v.id("documentTemplateFields") },
  handler: async (ctx, args) => {
    const field = await ctx.db.get(args.id);
    if (!field) throw new Error("Field not found");
    const template = await ctx.db.get(field.templateId);
    if (!template) throw new Error("Template not found");
    await verifyOrgAccess(ctx, template.organizationId);

    await ctx.db.delete(args.id);
  },
});

export const reorder = mutation({
  args: {
    templateId: v.id("documentTemplates"),
    fieldIds: v.array(v.id("documentTemplateFields")),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");
    await verifyOrgAccess(ctx, template.organizationId);

    for (let i = 0; i < args.fieldIds.length; i++) {
      await ctx.db.patch(args.fieldIds[i], { sortOrder: i });
    }
  },
});
