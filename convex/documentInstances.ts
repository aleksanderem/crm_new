import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";
import { resolveSource } from "./documentDataSources";

const statusValidator = v.union(
  v.literal("draft"),
  v.literal("pending_review"),
  v.literal("approved"),
  v.literal("pending_signature"),
  v.literal("signed"),
  v.literal("archived"),
);

// ---------------------------------------------------------------------------
// Rendering engine
// ---------------------------------------------------------------------------

/**
 * Replace field placeholders in HTML with actual values.
 * Supports two formats:
 * 1. TipTap mention spans: <span ... data-field="key" ...>Label</span>
 * 2. Raw text placeholders: {{field:key}}
 */
function renderTemplate(
  content: string,
  fieldValues: Record<string, unknown>,
): string {
  // Handle TipTap mention spans first
  let result = content.replace(
    /<span[^>]*data-field="([^"]+)"[^>]*>([^<]*)<\/span>/g,
    (_match, key, label) => {
      const val = fieldValues[key];
      if (val != null && val !== "") return String(val);
      return `<span style="background:#dbeafe;padding:1px 6px;border-radius:3px;color:#1e40af;font-size:0.875em">[${label || key}]</span>`;
    },
  );
  // Also handle raw {{field:key}} placeholders
  result = result.replace(/\{\{field:(\w+)\}\}/g, (_match, key) => {
    const val = fieldValues[key];
    if (val != null && val !== "") return String(val);
    return `<span style="background:#dbeafe;padding:1px 6px;border-radius:3px;color:#1e40af;font-size:0.875em">[${key}]</span>`;
  });
  return result;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(statusValidator),
    module: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    let results = await ctx.db
      .query("documentInstances")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .collect();

    if (args.status) results = results.filter((d) => d.status === args.status);
    if (args.module) results = results.filter((d) => d.module === args.module);

    return results;
  },
});

export const getById = query({
  args: { id: v.id("documentInstances") },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.id);
    if (!instance) return null;
    await verifyOrgAccess(ctx, instance.organizationId);
    return instance;
  },
});

export const listBySource = query({
  args: {
    organizationId: v.id("organizations"),
    sourceKey: v.string(),
    sourceInstanceId: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const all = await ctx.db
      .query("documentInstances")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .collect();

    return all.filter((d) => {
      const sources = d.resolvedSources as Record<string, string> | undefined;
      return sources?.[args.sourceKey] === args.sourceInstanceId;
    });
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("documentTemplates"),
    title: v.string(),
    sources: v.any(),
    fieldOverrides: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");
    if (template.status !== "active") throw new Error("Template is not active");

    // Load fields
    const fields = await ctx.db
      .query("documentTemplateFields")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .collect();

    // Resolve all sources
    const sources: Record<string, string> = args.sources ?? {};
    const rctx = { orgId: args.organizationId as string, userId: user._id as string };
    const resolvedData: Record<string, Record<string, string>> = {};

    for (const sourceKey of Object.keys(sources)) {
      resolvedData[sourceKey] = await resolveSource(ctx, sourceKey, sources[sourceKey], rctx);
    }
    // Always resolve platform sources (system, current_user, org)
    if (!resolvedData.system) resolvedData.system = await resolveSource(ctx, "system", null, rctx);
    if (!resolvedData.current_user) resolvedData.current_user = await resolveSource(ctx, "current_user", null, rctx);
    if (!resolvedData.org) resolvedData.org = await resolveSource(ctx, "org", null, rctx);

    // Build field values: binding → resolved data, else static default, else override
    const overrides: Record<string, unknown> = args.fieldOverrides ?? {};
    const fieldValues: Record<string, unknown> = {};

    for (const field of fields) {
      // Priority: explicit override > binding > static default > empty
      if (overrides[field.fieldKey] !== undefined) {
        fieldValues[field.fieldKey] = overrides[field.fieldKey];
      } else if (field.binding) {
        const sourceData = resolvedData[field.binding.source];
        fieldValues[field.fieldKey] = sourceData?.[field.binding.field] ?? "";
      } else if (field.defaultValue != null) {
        fieldValues[field.fieldKey] = field.defaultValue;
      } else {
        fieldValues[field.fieldKey] = "";
      }
    }

    // Render HTML
    const renderedContent = renderTemplate(template.content, fieldValues);

    // Build signature slots from template
    const signatures = template.signatureSlots.map((slot) => ({
      slotId: slot.id,
      slotLabel: slot.label,
      verificationMethod: slot.verificationMethod,
      signerType: slot.signerType,
    }));

    return await ctx.db.insert("documentInstances", {
      organizationId: args.organizationId,
      type: "template",
      templateId: args.templateId,
      templateVersion: template.version,
      title: args.title,
      renderedContent,
      fieldValues,
      resolvedSources: sources,
      status: "draft",
      module: template.module,
      signatures,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

const NON_EDITABLE_STATUSES = ["signed", "archived"];

export const updateDraft = mutation({
  args: {
    id: v.id("documentInstances"),
    title: v.optional(v.string()),
    fieldValues: v.optional(v.any()),
    renderedContent: v.optional(v.string()),
    category: v.optional(v.string()),
    fileId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.id);
    if (!instance) throw new Error("Document not found");
    if (NON_EDITABLE_STATUSES.includes(instance.status)) {
      throw new Error("Podpisanych i zarchiwizowanych dokumentów nie można edytować");
    }
    await verifyOrgAccess(ctx, instance.organizationId);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.fieldValues !== undefined) patch.fieldValues = args.fieldValues;
    if (args.renderedContent !== undefined) patch.renderedContent = args.renderedContent;
    if (args.category !== undefined) patch.category = args.category;
    if (args.fileId !== undefined) {
      patch.fileId = args.fileId;
      patch.fileUrl = (await ctx.storage.getUrl(args.fileId)) ?? undefined;
    }
    if (args.fileName !== undefined) patch.fileName = args.fileName;
    if (args.mimeType !== undefined) patch.mimeType = args.mimeType;
    if (args.fileSize !== undefined) patch.fileSize = args.fileSize;

    await ctx.db.patch(args.id, patch);
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("documentInstances"),
    status: statusValidator,
    assignedReviewerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.id);
    if (!instance) throw new Error("Document not found");
    const { user } = await verifyOrgAccess(ctx, instance.organizationId);
    const now = Date.now();

    // Validate transitions
    const validTransitions: Record<string, string[]> = {
      draft: ["pending_review", "approved", "pending_signature"],
      pending_review: ["draft", "approved"],
      approved: ["pending_signature", "archived"],
      pending_signature: ["signed", "archived"],
      signed: ["archived"],
      archived: ["approved", "signed"],
    };

    const allowed = validTransitions[instance.status];
    if (!allowed?.includes(args.status)) {
      throw new Error(`Cannot transition from ${instance.status} to ${args.status}`);
    }

    const patch: Record<string, unknown> = { status: args.status, updatedAt: now };

    if (args.status === "approved") {
      patch.approvedBy = user._id;
      patch.approvedAt = now;
    }
    if (args.status === "pending_review") {
      patch.reviewedBy = user._id;
      patch.reviewedAt = now;
      if (args.assignedReviewerId) {
        patch.assignedReviewerId = args.assignedReviewerId;
        const reviewer = await ctx.db.get(args.assignedReviewerId);
        patch.assignedReviewerName = reviewer?.name ?? "";
      }
    }

    await ctx.db.patch(args.id, patch);
  },
});

export const sign = mutation({
  args: {
    id: v.id("documentInstances"),
    slotId: v.string(),
    signatureData: v.string(),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.id);
    if (!instance) throw new Error("Document not found");
    if (instance.status !== "pending_signature" && instance.status !== "approved") {
      throw new Error("Document is not in a signable state");
    }
    const { user } = await verifyOrgAccess(ctx, instance.organizationId);
    const now = Date.now();

    const signatures = [...instance.signatures];
    const slotIndex = signatures.findIndex((s) => s.slotId === args.slotId);
    if (slotIndex === -1) throw new Error("Signature slot not found");
    if (signatures[slotIndex].signatureData) throw new Error("Slot already signed");

    signatures[slotIndex] = {
      ...signatures[slotIndex],
      signatureData: args.signatureData,
      signedByUserId: user._id,
      signedByName: user.name ?? "",
      signedAt: now,
    };

    // Check if all slots are signed
    const allSigned = signatures.every((s) => s.signatureData);

    await ctx.db.patch(args.id, {
      signatures,
      status: allSigned ? "signed" : instance.status,
      updatedAt: now,
    });
  },
});

export const createFromFile = mutation({
  args: {
    organizationId: v.id("organizations"),
    title: v.string(),
    fileId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    category: v.optional(v.string()),
    module: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const fileUrl = await ctx.storage.getUrl(args.fileId);

    return await ctx.db.insert("documentInstances", {
      organizationId: args.organizationId,
      type: "file",
      title: args.title,
      fileId: args.fileId,
      fileUrl: fileUrl ?? undefined,
      fileName: args.fileName,
      mimeType: args.mimeType,
      fileSize: args.fileSize,
      category: args.category,
      module: args.module,
      status: "draft",
      signatures: [],
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const generateUploadUrl = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const remove = mutation({
  args: { id: v.id("documentInstances") },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.id);
    if (!instance) throw new Error("Document not found");
    if (NON_EDITABLE_STATUSES.includes(instance.status)) {
      throw new Error("Podpisanych i zarchiwizowanych dokumentów nie można usunąć");
    }
    await verifyOrgAccess(ctx, instance.organizationId);

    await ctx.db.delete(args.id);
  },
});
