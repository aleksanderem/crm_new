import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

const writeTemplateRef = internal.supabase.documentTemplates.writeDocumentTemplateToSupabase;
const updateTemplateRef = internal.supabase.documentTemplates.updateDocumentTemplateInSupabase;
const writeFieldRef = internal.supabase.documentTemplateFields.writeDocumentTemplateFieldToSupabase;

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

    const templateId = await ctx.db.insert("documentTemplates", {
      ...args,
      version: 1,
      status: "draft",
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    // Dual-write: replicate new document template to Supabase
    await ctx.scheduler.runAfter(0, writeTemplateRef, {
      templateId: templateId as string,
      organizationId: args.organizationId as string,
      name: args.name,
      description: args.description,
      category: args.category,
      content: args.content,
      module: args.module,
      requiredSources: args.requiredSources,
      requiresSignature: args.requiresSignature,
      signatureSlots: JSON.stringify(args.signatureSlots),
      accessControl: JSON.stringify(args.accessControl),
      version: 1,
      status: "draft",
      createdBy: user._id as string,
      createdAt: now,
      updatedAt: now,
    });

    return templateId;
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
    const updatedAt = Date.now();
    cleaned.updatedAt = updatedAt;

    await ctx.db.patch(args.id, cleaned);

    // Dual-write: replicate template update to Supabase
    await ctx.scheduler.runAfter(0, updateTemplateRef, {
      templateId: args.id as string,
      organizationId: template.organizationId as string,
      name: args.name,
      description: args.description,
      category: args.category,
      content: args.content,
      module: args.module,
      requiredSources: args.requiredSources,
      requiresSignature: args.requiresSignature,
      signatureSlots: args.signatureSlots ? JSON.stringify(args.signatureSlots) : undefined,
      accessControl: args.accessControl ? JSON.stringify(args.accessControl) : undefined,
      updatedAt,
    });
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

    const publishedAt = Date.now();
    await ctx.db.patch(args.id, {
      status: "active",
      updatedAt: publishedAt,
    });

    // Dual-write: replicate publish to Supabase
    await ctx.scheduler.runAfter(0, updateTemplateRef, {
      templateId: args.id as string,
      organizationId: template.organizationId as string,
      status: "active",
      updatedAt: publishedAt,
    });
  },
});

export const archive = mutation({
  args: { id: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.id);
    if (!template) throw new Error("Template not found");
    await verifyOrgAccess(ctx, template.organizationId);

    const archivedAt = Date.now();
    await ctx.db.patch(args.id, {
      status: "archived",
      updatedAt: archivedAt,
    });

    // Dual-write: replicate archive to Supabase
    await ctx.scheduler.runAfter(0, updateTemplateRef, {
      templateId: args.id as string,
      organizationId: template.organizationId as string,
      status: "archived",
      updatedAt: archivedAt,
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

    // Dual-write: replicate duplicated template to Supabase
    await ctx.scheduler.runAfter(0, writeTemplateRef, {
      templateId: newId as string,
      organizationId: template.organizationId as string,
      name: `${template.name} — kopia`,
      description: template.description,
      category: template.category,
      content: template.content,
      module: template.module,
      requiredSources: template.requiredSources,
      requiresSignature: template.requiresSignature,
      signatureSlots: JSON.stringify(template.signatureSlots),
      accessControl: JSON.stringify(template.accessControl),
      version: 1,
      status: "draft",
      createdBy: user._id as string,
      createdAt: now,
      updatedAt: now,
    });

    // Copy fields
    const fields = await ctx.db
      .query("documentTemplateFields")
      .withIndex("by_template", (q) => q.eq("templateId", args.id))
      .collect();

    for (const field of fields) {
      const fieldId = await ctx.db.insert("documentTemplateFields", {
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

      // Dual-write: replicate duplicated field to Supabase
      await ctx.scheduler.runAfter(0, writeFieldRef, {
        fieldId: fieldId as string,
        templateId: newId as string,
        fieldKey: field.fieldKey,
        label: field.label,
        type: field.type,
        sortOrder: field.sortOrder,
        group: field.group,
        options: field.options ? JSON.stringify(field.options) : undefined,
        defaultValue: field.defaultValue,
        binding: field.binding ? JSON.stringify(field.binding) : undefined,
        validation: field.validation ? JSON.stringify(field.validation) : undefined,
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
    const newVersion = template.version + 1;
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
      version: newVersion,
      parentTemplateId: template._id,
      status: "draft",
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    // Dual-write: replicate new version to Supabase
    await ctx.scheduler.runAfter(0, writeTemplateRef, {
      templateId: newId as string,
      organizationId: template.organizationId as string,
      name: template.name,
      description: template.description,
      category: template.category,
      content: template.content,
      module: template.module,
      requiredSources: template.requiredSources,
      requiresSignature: template.requiresSignature,
      signatureSlots: JSON.stringify(template.signatureSlots),
      accessControl: JSON.stringify(template.accessControl),
      version: newVersion,
      parentTemplateId: template._id as string,
      status: "draft",
      createdBy: user._id as string,
      createdAt: now,
      updatedAt: now,
    });

    // Copy fields
    const fields = await ctx.db
      .query("documentTemplateFields")
      .withIndex("by_template", (q) => q.eq("templateId", args.id))
      .collect();

    for (const field of fields) {
      const fieldId = await ctx.db.insert("documentTemplateFields", {
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

      // Dual-write: replicate copied field to Supabase
      await ctx.scheduler.runAfter(0, writeFieldRef, {
        fieldId: fieldId as string,
        templateId: newId as string,
        fieldKey: field.fieldKey,
        label: field.label,
        type: field.type,
        sortOrder: field.sortOrder,
        group: field.group,
        options: field.options ? JSON.stringify(field.options) : undefined,
        defaultValue: field.defaultValue,
        binding: field.binding ? JSON.stringify(field.binding) : undefined,
        validation: field.validation ? JSON.stringify(field.validation) : undefined,
        placeholder: field.placeholder,
        helpText: field.helpText,
        width: field.width,
      });
    }

    return newId;
  },
});
