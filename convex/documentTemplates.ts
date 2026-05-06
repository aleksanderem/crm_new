import { query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { verifyOrgAccess } from "./_helpers/auth";

// Dual-write refs removed — Supabase is now primary for document template writes

const categoryValidator = v.union(
  v.literal("contract"),
  v.literal("invoice"),
  v.literal("consent"),
  v.literal("referral"),
  v.literal("prescription"),
  v.literal("report"),
  v.literal("protocol"),
  v.literal("custom"),
);

const statusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived"),
);

const signatureSlotValidator = v.object({
  id: v.string(),
  role: v.union(
    v.literal("author"),
    v.literal("client"),
    v.literal("patient"),
    v.literal("employee"),
    v.literal("witness"),
    v.literal("custom"),
  ),
  label: v.string(),
  verificationMethod: v.optional(v.union(
    v.literal("click"),
    v.literal("sms"),
    v.literal("email_otp"),
  )),
  signerType: v.optional(v.union(
    v.literal("internal"),
    v.literal("external"),
  )),
});

const accessControlValidator = v.object({
  mode: v.union(v.literal("all"), v.literal("roles"), v.literal("users")),
  roles: v.array(v.string()),
  userIds: v.array(v.string()),
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(statusValidator),
    category: v.optional(categoryValidator),
    module: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    let results = await ctx.db
      .query("documentTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    if (args.status) results = results.filter((t) => t.status === args.status);
    if (args.category) results = results.filter((t) => t.category === args.category);
    if (args.module) results = results.filter((t) => t.module === args.module || t.module === "platform");

    const withFieldCounts = await Promise.all(
      results.map(async (t) => {
        const fields = await ctx.db
          .query("documentTemplateFields")
          .withIndex("by_template", (q) => q.eq("templateId", t._id))
          .collect();
        return { ...t, fieldCount: fields.length };
      }),
    );

    return withFieldCounts;
  },
});

export const getById = query({
  args: { id: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.id);
    if (!template) return null;
    await verifyOrgAccess(ctx, template.organizationId);
    return template;
  },
});

export const listActive = query({
  args: {
    organizationId: v.id("organizations"),
    module: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, membership } = await verifyOrgAccess(ctx, args.organizationId);

    let results = await ctx.db
      .query("documentTemplates")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "active"),
      )
      .collect();

    if (args.module) {
      results = results.filter((t) => t.module === args.module || t.module === "platform");
    }

    results = results.filter((t) => {
      if (t.accessControl.mode === "all") return true;
      if (t.accessControl.mode === "roles") return t.accessControl.roles.includes(membership.role);
      if (t.accessControl.mode === "users") return t.accessControl.userIds.some((id) => id === user._id);
      return false;
    });

    const withFieldCounts = await Promise.all(
      results.map(async (t) => {
        const fields = await ctx.db
          .query("documentTemplateFields")
          .withIndex("by_template", (q) => q.eq("templateId", t._id))
          .collect();
        return { ...t, fieldCount: fields.length };
      }),
    );

    return withFieldCounts;
  },
});

// ---------------------------------------------------------------------------
// Actions (Supabase-primary)
// ---------------------------------------------------------------------------

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    category: categoryValidator,
    content: v.string(),
    module: v.string(),
    requiredSources: v.array(v.string()),
    requiresSignature: v.boolean(),
    signatureSlots: v.array(signatureSlotValidator),
    accessControl: accessControlValidator,
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const now = Date.now();
    const db = createSupabaseDb();

    const templateId = await db.insert("documentTemplates", {
      organizationId: String(args.organizationId),
      name: args.name,
      description: args.description ?? null,
      category: args.category,
      content: args.content,
      module: args.module,
      requiredSources: args.requiredSources,
      requiresSignature: args.requiresSignature,
      signatureSlots: JSON.stringify(args.signatureSlots),
      accessControl: JSON.stringify(args.accessControl),
      version: 1,
      status: "draft",
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    return templateId;
  },
});

export const update = action({
  args: {
    id: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(categoryValidator),
    content: v.optional(v.string()),
    module: v.optional(v.string()),
    requiredSources: v.optional(v.array(v.string())),
    requiresSignature: v.optional(v.boolean()),
    signatureSlots: v.optional(v.array(signatureSlotValidator)),
    accessControl: v.optional(accessControlValidator),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const template = await db.get("documentTemplates", args.id);
    if (!template) throw new Error("Template not found");

    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: template.organizationId as Id<"organizations"> },
    );

    const { id, ...patch } = args;
    const cleaned: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) {
        if (k === "signatureSlots" || k === "accessControl") {
          cleaned[k] = JSON.stringify(val);
        } else {
          cleaned[k] = val;
        }
      }
    }
    cleaned.updatedAt = Date.now();

    await db.patch("documentTemplates", args.id, cleaned);
  },
});

export const publish = action({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const template = await db.get("documentTemplates", args.id);
    if (!template) throw new Error("Template not found");

    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: template.organizationId as Id<"organizations"> },
    );

    if (template.status === "active") {
      throw new Error("Template is already active");
    }

    // If this is a new version, archive the parent
    if (template.parentTemplateId) {
      await db.patch("documentTemplates", template.parentTemplateId as string, {
        status: "archived",
        updatedAt: Date.now(),
      });
    }

    await db.patch("documentTemplates", args.id, {
      status: "active",
      updatedAt: Date.now(),
    });
  },
});

export const archive = action({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const template = await db.get("documentTemplates", args.id);
    if (!template) throw new Error("Template not found");

    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: template.organizationId as Id<"organizations"> },
    );

    await db.patch("documentTemplates", args.id, {
      status: "archived",
      updatedAt: Date.now(),
    });
  },
});

export const duplicate = action({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const template = await db.get("documentTemplates", args.id);
    if (!template) throw new Error("Template not found");

    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: template.organizationId as Id<"organizations"> },
    );
    const now = Date.now();

    const newId = await db.insert("documentTemplates", {
      organizationId: String(template.organizationId),
      name: `${template.name} — kopia`,
      description: template.description ?? null,
      category: template.category,
      content: template.content,
      module: template.module,
      requiredSources: template.requiredSources,
      requiresSignature: template.requiresSignature ?? false,
      signatureSlots: typeof template.signatureSlots === "string" ? template.signatureSlots : JSON.stringify(template.signatureSlots),
      accessControl: typeof template.accessControl === "string" ? template.accessControl : JSON.stringify(template.accessControl),
      version: 1,
      status: "draft",
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    // Copy fields via side effect (needs Convex db reads)
    try {
      await ctx.runMutation(internal.documentTemplates._duplicateFields, {
        sourceTemplateId: args.id,
        targetTemplateId: newId,
      });
    } catch (e) {
      console.error("[documentTemplates.duplicate] Field copy FAILED:", e);
    }

    return newId;
  },
});

export const _duplicateFields = internalMutation({
  args: {
    sourceTemplateId: v.string(),
    targetTemplateId: v.string(),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const fields = await ctx.db
      .query("documentTemplateFields")
      .withIndex("by_template", (q) => q.eq("templateId", args.sourceTemplateId as any))
      .collect();

    for (const field of fields) {
      await db.insert("documentTemplateFields", {
        templateId: args.targetTemplateId,
        fieldKey: field.fieldKey,
        label: field.label,
        type: field.type,
        sortOrder: field.sortOrder,
        group: field.group ?? null,
        options: field.options ? JSON.stringify(field.options) : null,
        defaultValue: field.defaultValue ?? null,
        binding: field.binding ? JSON.stringify(field.binding) : null,
        validation: field.validation ? JSON.stringify(field.validation) : null,
        placeholder: field.placeholder ?? null,
        helpText: field.helpText ?? null,
        width: field.width,
      });
    }
  },
});

export const createNewVersion = action({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const template = await db.get("documentTemplates", args.id);
    if (!template) throw new Error("Template not found");
    if (template.status !== "active") throw new Error("Can only create new version of active template");

    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: template.organizationId as Id<"organizations"> },
    );
    const now = Date.now();

    const newVersion = (template.version as number ?? 1) + 1;
    const newId = await db.insert("documentTemplates", {
      organizationId: String(template.organizationId),
      name: template.name,
      description: template.description ?? null,
      category: template.category,
      content: template.content,
      module: template.module,
      requiredSources: template.requiredSources,
      requiresSignature: template.requiresSignature ?? false,
      signatureSlots: typeof template.signatureSlots === "string" ? template.signatureSlots : JSON.stringify(template.signatureSlots),
      accessControl: typeof template.accessControl === "string" ? template.accessControl : JSON.stringify(template.accessControl),
      version: newVersion,
      parentTemplateId: args.id,
      status: "draft",
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    // Copy fields via side effect
    try {
      await ctx.runMutation(internal.documentTemplates._duplicateFields, {
        sourceTemplateId: args.id,
        targetTemplateId: newId,
      });
    } catch (e) {
      console.error("[documentTemplates.createNewVersion] Field copy FAILED:", e);
    }

    return newId;
  },
});
