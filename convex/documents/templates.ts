import { query, action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { formCategoryValidator } from "../schema/documents";

// Dual-write refs removed — Supabase is now primary for template writes

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { verifyOrgAccess } = await import("../_helpers/auth");
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
    const { verifyOrgAccess } = await import("../_helpers/auth");
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
    const { verifyOrgAccess } = await import("../_helpers/auth");
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
    const { verifyOrgAccess } = await import("../_helpers/auth");
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
    const { verifyOrgAccess } = await import("../_helpers/auth");
    await verifyOrgAccess(ctx, args.organizationId);
    const all = await ctx.db
      .query("formTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return all.filter((t) => t.templateType === "document" && t.isActive);
  },
});

export const create = action({
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
    // requireOrgAdmin via authAction
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }

    const now = Date.now();
    const db = createSupabaseDb();

    const templateId = await db.insert("formTemplates", {
      organizationId: String(args.organizationId),
      name: args.name,
      description: args.description ?? null,
      category: args.category,
      folderPath: args.folderPath ?? null,
      templateType: args.templateType ?? "document",
      formJson: args.formJson ?? "{}",
      contentJson: args.contentJson ?? null,
      modules: args.modules,
      entityTypes: args.entityTypes,
      variableBindings: args.variableBindings ?? null,
      requiresSignature: args.requiresSignature,
      signatureConfig: args.signatureConfig ? JSON.stringify(args.signatureConfig) : null,
      accessRoles: args.accessRoles ?? null,
      version: 1,
      isActive: true,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    return templateId;
  },
});

export const duplicate = action({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }

    const db = createSupabaseDb();
    const source = await db.get("formTemplates", args.templateId);
    if (!source || String(source.organizationId) !== String(args.organizationId)) {
      throw new Error("Template not found");
    }

    const now = Date.now();
    const dupId = await db.insert("formTemplates", {
      organizationId: String(args.organizationId),
      name: `${source.name} (Kopia)`,
      description: source.description ?? null,
      category: source.category,
      folderPath: source.folderPath ?? null,
      templateType: source.templateType ?? "document",
      formJson: source.formJson ?? "{}",
      contentJson: source.contentJson ?? null,
      modules: source.modules,
      entityTypes: source.entityTypes,
      variableBindings: source.variableBindings ?? null,
      requiresSignature: source.requiresSignature ?? false,
      signatureConfig: source.signatureConfig ? (typeof source.signatureConfig === "string" ? source.signatureConfig : JSON.stringify(source.signatureConfig)) : null,
      accessRoles: source.accessRoles ?? null,
      version: 1,
      isActive: true,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    return dupId;
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.string(),
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
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }

    const db = createSupabaseDb();
    const tmpl = await db.get("formTemplates", args.templateId);
    if (!tmpl || String(tmpl.organizationId) !== String(args.organizationId))
      throw new Error("Template not found");

    const { organizationId: _orgId, templateId, ...updates } = args;
    // If formJson or contentJson changed, bump version
    const contentChanged =
      (updates.formJson && updates.formJson !== tmpl.formJson) ||
      (updates.contentJson && updates.contentJson !== tmpl.contentJson);
    const newVersion = contentChanged ? (tmpl.version as number ?? 1) + 1 : (tmpl.version as number ?? 1);

    const patchData: Record<string, unknown> = { ...updates, version: newVersion, updatedAt: Date.now() };
    // Serialize signatureConfig for Supabase
    if (patchData.signatureConfig && typeof patchData.signatureConfig !== "string") {
      patchData.signatureConfig = JSON.stringify(patchData.signatureConfig);
    }

    await db.patch("formTemplates", templateId, patchData);

    return templateId;
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }

    const db = createSupabaseDb();
    const tmpl = await db.get("formTemplates", args.templateId);
    if (!tmpl || String(tmpl.organizationId) !== String(args.organizationId))
      throw new Error("Template not found");

    // Soft delete
    await db.patch("formTemplates", args.templateId, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});
