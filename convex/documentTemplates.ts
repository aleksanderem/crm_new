import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

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
  ),
  label: v.string(),
});

const accessControlValidator = v.object({
  mode: v.union(v.literal("all"), v.literal("roles"), v.literal("users")),
  roles: v.array(v.string()),
  userIds: v.array(v.id("users")),
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

    // Count fields per template
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

    // Filter by access control
    results = results.filter((t) => {
      if (t.accessControl.mode === "all") return true;
      if (t.accessControl.mode === "roles") return t.accessControl.roles.includes(membership.role);
      if (t.accessControl.mode === "users") return t.accessControl.userIds.some((id) => id === user._id);
      return false;
    });

    // Attach field count
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
// Mutations
// ---------------------------------------------------------------------------

export const create = mutation({
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
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    return await ctx.db.insert("documentTemplates", {
      ...args,
      version: 1,
      status: "draft",
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("documentTemplates"),
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
    const template = await ctx.db.get(args.id);
    if (!template) throw new Error("Template not found");
    await verifyOrgAccess(ctx, template.organizationId);

    const { id, ...patch } = args;
    const cleaned: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) cleaned[k] = val;
    }
    cleaned.updatedAt = Date.now();

    await ctx.db.patch(args.id, cleaned);
  },
});

export const publish = mutation({
  args: { id: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.id);
    if (!template) throw new Error("Template not found");
    await verifyOrgAccess(ctx, template.organizationId);

    if (template.status === "active") {
      throw new Error("Template is already active");
    }

    // If this is a new version of an existing template, archive the parent
    if (template.parentTemplateId) {
      await ctx.db.patch(template.parentTemplateId, {
        status: "archived",
        updatedAt: Date.now(),
      });
    }

    await ctx.db.patch(args.id, {
      status: "active",
      updatedAt: Date.now(),
    });
  },
});

export const archive = mutation({
  args: { id: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.id);
    if (!template) throw new Error("Template not found");
    await verifyOrgAccess(ctx, template.organizationId);

    await ctx.db.patch(args.id, {
      status: "archived",
      updatedAt: Date.now(),
    });
  },
});

export const duplicate = mutation({
  args: { id: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.id);
    if (!template) throw new Error("Template not found");
    const { user } = await verifyOrgAccess(ctx, template.organizationId);
    const now = Date.now();

    // Copy template
    const newId = await ctx.db.insert("documentTemplates", {
      organizationId: template.organizationId,
      name: `${template.name} — kopia`,
      description: template.description,
      category: template.category,
      content: template.content,
      module: template.module,
      requiredSources: template.requiredSources,
      requiresSignature: template.requiresSignature,
      signatureSlots: template.signatureSlots,
      accessControl: template.accessControl,
      version: 1,
      status: "draft",
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    // Copy fields
    const fields = await ctx.db
      .query("documentTemplateFields")
      .withIndex("by_template", (q) => q.eq("templateId", args.id))
      .collect();

    for (const field of fields) {
      await ctx.db.insert("documentTemplateFields", {
        templateId: newId,
        fieldKey: field.fieldKey,
        label: field.label,
        type: field.type,
        sortOrder: field.sortOrder,
        group: field.group,
        options: field.options,
        defaultValue: field.defaultValue,
        binding: field.binding,
        validation: field.validation,
        placeholder: field.placeholder,
        helpText: field.helpText,
        width: field.width,
      });
    }

    return newId;
  },
});

export const createNewVersion = mutation({
  args: { id: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.id);
    if (!template) throw new Error("Template not found");
    if (template.status !== "active") throw new Error("Can only create new version of active template");
    const { user } = await verifyOrgAccess(ctx, template.organizationId);
    const now = Date.now();

    // Create draft copy with version bump and parent reference
    const newId = await ctx.db.insert("documentTemplates", {
      organizationId: template.organizationId,
      name: template.name,
      description: template.description,
      category: template.category,
      content: template.content,
      module: template.module,
      requiredSources: template.requiredSources,
      requiresSignature: template.requiresSignature,
      signatureSlots: template.signatureSlots,
      accessControl: template.accessControl,
      version: template.version + 1,
      parentTemplateId: template._id,
      status: "draft",
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    // Copy fields
    const fields = await ctx.db
      .query("documentTemplateFields")
      .withIndex("by_template", (q) => q.eq("templateId", args.id))
      .collect();

    for (const field of fields) {
      await ctx.db.insert("documentTemplateFields", {
        templateId: newId,
        fieldKey: field.fieldKey,
        label: field.label,
        type: field.type,
        sortOrder: field.sortOrder,
        group: field.group,
        options: field.options,
        defaultValue: field.defaultValue,
        binding: field.binding,
        validation: field.validation,
        placeholder: field.placeholder,
        helpText: field.helpText,
        width: field.width,
      });
    }

    return newId;
  },
});
