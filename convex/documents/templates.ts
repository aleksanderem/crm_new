import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess, requireOrgAdmin } from "../_helpers/auth";
import { formCategoryValidator } from "../schema/documents";

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("formTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("formTemplates"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const tmpl = await ctx.db.get(args.templateId);
    if (!tmpl || tmpl.organizationId !== args.organizationId)
      throw new Error("Template not found");
    return tmpl;
  },
});

export const listByCategory = query({
  args: {
    organizationId: v.id("organizations"),
    category: formCategoryValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("formTemplates")
      .withIndex("by_orgAndCategory", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("category", args.category),
      )
      .collect();
  },
});

export const listByEntityType = query({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const all = await ctx.db
      .query("formTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return all.filter(
      (t) => t.isActive && t.entityTypes.includes(args.entityType),
    );
  },
});

export const listDocumentTemplates = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const all = await ctx.db
      .query("formTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return all.filter((t) => t.templateType === "document" && t.isActive);
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    category: formCategoryValidator,
    folderPath: v.optional(v.string()),
    templateType: v.optional(v.literal("document")),
    formJson: v.optional(v.string()),
    contentJson: v.optional(v.string()),
    modules: v.array(v.string()),
    entityTypes: v.array(v.string()),
    variableBindings: v.optional(v.string()),
    requiresSignature: v.boolean(),
    signatureConfig: v.optional(
      v.object({
        method: v.union(
          v.literal("click"),
          v.literal("sms"),
          v.literal("email_otp"),
          v.literal("draw"),
        ),
        signerRole: v.union(
          v.literal("client"),
          v.literal("patient"),
          v.literal("employee"),
          v.literal("external"),
        ),
        reminderEnabled: v.optional(v.boolean()),
        reminderIntervalHours: v.optional(v.number()),
      }),
    ),
    accessRoles: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();
    return await ctx.db.insert("formTemplates", {
      ...args,
      formJson: args.formJson ?? "{}",
      templateType: args.templateType ?? "document",
      version: 1,
      isActive: true,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const duplicate = mutation({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("formTemplates"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const source = await ctx.db.get(args.templateId);
    if (!source || source.organizationId !== args.organizationId) {
      throw new Error("Template not found");
    }
    const now = Date.now();
    const {
      _id,
      _creationTime,
      createdBy: _cb,
      createdAt: _ca,
      updatedAt: _ua,
      version: _v,
      isActive: _ia,
      ...rest
    } = source;
    return await ctx.db.insert("formTemplates", {
      ...rest,
      name: `${source.name} (Kopia)`,
      version: 1,
      isActive: true,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("formTemplates"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(formCategoryValidator),
    folderPath: v.optional(v.string()),
    templateType: v.optional(v.literal("document")),
    formJson: v.optional(v.string()),
    contentJson: v.optional(v.string()),
    modules: v.optional(v.array(v.string())),
    entityTypes: v.optional(v.array(v.string())),
    variableBindings: v.optional(v.string()),
    requiresSignature: v.optional(v.boolean()),
    signatureConfig: v.optional(
      v.object({
        method: v.union(
          v.literal("click"),
          v.literal("sms"),
          v.literal("email_otp"),
          v.literal("draw"),
        ),
        signerRole: v.union(
          v.literal("client"),
          v.literal("patient"),
          v.literal("employee"),
          v.literal("external"),
        ),
        reminderEnabled: v.optional(v.boolean()),
        reminderIntervalHours: v.optional(v.number()),
      }),
    ),
    isActive: v.optional(v.boolean()),
    accessRoles: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const tmpl = await ctx.db.get(args.templateId);
    if (!tmpl || tmpl.organizationId !== args.organizationId)
      throw new Error("Template not found");

    const { organizationId: _orgId, templateId, ...updates } = args;
    // If formJson or contentJson changed, bump version
    const contentChanged =
      (updates.formJson && updates.formJson !== tmpl.formJson) ||
      (updates.contentJson && updates.contentJson !== tmpl.contentJson);
    const newVersion = contentChanged ? tmpl.version + 1 : tmpl.version;

    await ctx.db.patch(templateId, {
      ...updates,
      version: newVersion,
      updatedAt: Date.now(),
    });
    return templateId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("formTemplates"),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const tmpl = await ctx.db.get(args.templateId);
    if (!tmpl || tmpl.organizationId !== args.organizationId)
      throw new Error("Template not found");
    // Soft delete
    await ctx.db.patch(args.templateId, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});
