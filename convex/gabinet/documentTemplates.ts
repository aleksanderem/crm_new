import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess, requireOrgAdmin } from "../_helpers/auth";
import { gabinetDocTypeValidator } from "../schema";

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("gabinetDocumentTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const listByType = query({
  args: {
    organizationId: v.id("organizations"),
    type: gabinetDocTypeValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("gabinetDocumentTemplates")
      .withIndex("by_orgAndType", (q) =>
        q.eq("organizationId", args.organizationId).eq("type", args.type)
      )
      .collect();
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("gabinetDocumentTemplates"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const tmpl = await ctx.db.get(args.templateId);
    if (!tmpl || tmpl.organizationId !== args.organizationId) throw new Error("Template not found");
    return tmpl;
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    type: gabinetDocTypeValidator,
    content: v.string(),
    requiresSignature: v.boolean(),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();

    return await ctx.db.insert("gabinetDocumentTemplates", {
      ...args,
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
    templateId: v.id("gabinetDocumentTemplates"),
    name: v.optional(v.string()),
    type: v.optional(gabinetDocTypeValidator),
    content: v.optional(v.string()),
    requiresSignature: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const tmpl = await ctx.db.get(args.templateId);
    if (!tmpl || tmpl.organizationId !== args.organizationId) throw new Error("Template not found");

    const { organizationId, templateId, ...updates } = args;
    await ctx.db.patch(templateId, { ...updates, updatedAt: Date.now() });
    return templateId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("gabinetDocumentTemplates"),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const tmpl = await ctx.db.get(args.templateId);
    if (!tmpl || tmpl.organizationId !== args.organizationId) throw new Error("Template not found");

    await ctx.db.patch(args.templateId, { isActive: false, updatedAt: Date.now() });
  },
});
