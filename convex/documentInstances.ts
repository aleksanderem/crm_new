import { query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { verifyOrgAccess } from "./_helpers/auth";
import { resolveSource } from "./documentDataSources";
import { escapeHtml } from "./_helpers/html";

// Dual-write refs removed — Supabase is now primary for document instance writes

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

function renderTemplate(
  content: string,
  fieldValues: Record<string, unknown>,
): string {
  let result = content.replace(
    /<span[^>]*data-field="([^"]+)"[^>]*>([^<]*)<\/span>/g,
    (_match, key, label) => {
      const val = fieldValues[key];
      if (val != null && val !== "") return escapeHtml(String(val));
      return `<span style="background:#dbeafe;padding:1px 6px;border-radius:3px;color:#1e40af;font-size:0.875em">[${label || key}]</span>`;
    },
  );
  result = result.replace(/\{\{field:(\w+)\}\}/g, (_match, key) => {
    const val = fieldValues[key];
    if (val != null && val !== "") return escapeHtml(String(val));
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
// Actions (Supabase-primary)
// ---------------------------------------------------------------------------

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.string(),
    title: v.string(),
    sources: v.any(),
    fieldOverrides: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    // Delegate template + field resolution + rendering to internal mutation
    // since resolveSource needs Convex db reads
    const result = await ctx.runMutation(internal.documentInstances._createResolveAndInsert, {
      organizationId: args.organizationId,
      templateId: args.templateId,
      title: args.title,
      sources: args.sources,
      fieldOverrides: args.fieldOverrides,
      userId: String(authResult.userId),
    });

    return result;
  },
});

export const _createResolveAndInsert = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.string(),
    title: v.string(),
    sources: v.any(),
    fieldOverrides: v.optional(v.any()),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const templateId = args.templateId as Id<"documentTemplates">;
    const template = await ctx.db.get(templateId);
    if (!template) throw new Error("Template not found");
    if (template.status !== "active") throw new Error("Template is not active");

    const fields = await ctx.db
      .query("documentTemplateFields")
      .withIndex("by_template", (q) => q.eq("templateId", templateId))
      .collect();

    const sources: Record<string, string> = args.sources ?? {};
    const rctx = { orgId: args.organizationId as string, userId: args.userId };
    const resolvedData: Record<string, Record<string, string>> = {};

    for (const sourceKey of Object.keys(sources)) {
      resolvedData[sourceKey] = await resolveSource(ctx, sourceKey, sources[sourceKey], rctx);
    }
    if (!resolvedData.system) resolvedData.system = await resolveSource(ctx, "system", null, rctx);
    if (!resolvedData.current_user) resolvedData.current_user = await resolveSource(ctx, "current_user", null, rctx);
    if (!resolvedData.org) resolvedData.org = await resolveSource(ctx, "org", null, rctx);

    const overrides: Record<string, unknown> = args.fieldOverrides ?? {};
    const fieldValues: Record<string, unknown> = {};

    for (const field of fields) {
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

    const renderedContent = renderTemplate(template.content, fieldValues);

    const signatures = template.signatureSlots.map((slot) => ({
      slotId: slot.id,
      slotLabel: slot.label,
      verificationMethod: slot.verificationMethod,
      signerType: slot.signerType,
    }));

    const db = createSupabaseDb();
    const userId = args.userId as any;

    const instanceId = await db.insert("documentInstances", {
      organizationId: String(args.organizationId),
      type: "template",
      templateId: args.templateId,
      templateVersion: template.version,
      title: args.title,
      renderedContent,
      fieldValues: JSON.stringify(fieldValues),
      resolvedSources: JSON.stringify(sources),
      status: "draft",
      module: template.module,
      signatures: JSON.stringify(signatures),
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    });

    return instanceId;
  },
});

const NON_EDITABLE_STATUSES = ["signed", "archived"];

export const updateDraft = action({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    fieldValues: v.optional(v.any()),
    renderedContent: v.optional(v.string()),
    category: v.optional(v.string()),
    fileId: v.optional(v.string()),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const instance = await db.get("documentInstances", args.id);
    if (!instance) throw new Error("Document not found");
    if (NON_EDITABLE_STATUSES.includes(instance.status as string)) {
      throw new Error("Podpisanych i zarchiwizowanych dokumentów nie można edytować");
    }

    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: instance.organizationId as string },
    );

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.fieldValues !== undefined) patch.fieldValues = typeof args.fieldValues === "string" ? args.fieldValues : JSON.stringify(args.fieldValues);
    if (args.renderedContent !== undefined) patch.renderedContent = args.renderedContent;
    if (args.category !== undefined) patch.category = args.category;
    if (args.fileId !== undefined) patch.fileId = args.fileId;
    if (args.fileName !== undefined) patch.fileName = args.fileName;
    if (args.mimeType !== undefined) patch.mimeType = args.mimeType;
    if (args.fileSize !== undefined) patch.fileSize = args.fileSize;

    // If fileId provided, resolve URL via side effect
    if (args.fileId) {
      try {
        const fileUrl = await ctx.runMutation(internal.documentInstances._resolveFileUrl, {
          fileId: args.fileId,
        });
        if (fileUrl) patch.fileUrl = fileUrl;
      } catch (e) {
        console.error("[documentInstances.updateDraft] File URL resolution FAILED:", e);
      }
    }

    await db.patch("documentInstances", args.id, patch);
  },
});

export const _resolveFileUrl = internalMutation({
  args: { fileId: v.string() },
  handler: async (ctx, args) => {
    const url = await ctx.storage.getUrl(args.fileId as any);
    return url ?? undefined;
  },
});

export const updateStatus = action({
  args: {
    id: v.string(),
    status: statusValidator,
    assignedReviewerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const instance = await db.get("documentInstances", args.id);
    if (!instance) throw new Error("Document not found");

    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: instance.organizationId as string },
    );

    const now = Date.now();

    const validTransitions: Record<string, string[]> = {
      draft: ["pending_review", "approved", "pending_signature"],
      pending_review: ["draft", "approved"],
      approved: ["pending_signature", "archived"],
      pending_signature: ["signed", "archived"],
      signed: ["archived"],
      archived: ["approved", "signed"],
    };

    const allowed = validTransitions[instance.status as string];
    if (!allowed?.includes(args.status)) {
      throw new Error(`Cannot transition from ${instance.status} to ${args.status}`);
    }

    const patch: Record<string, unknown> = { status: args.status, updatedAt: now };

    if (args.status === "approved") {
      patch.approvedBy = String(authResult.userId);
      patch.approvedAt = now;
    }
    if (args.status === "pending_review") {
      patch.reviewedBy = String(authResult.userId);
      patch.reviewedAt = now;
      if (args.assignedReviewerId) {
        patch.assignedReviewerId = args.assignedReviewerId;
        // Resolve reviewer name via side effect
        try {
          const reviewerName = await ctx.runMutation(internal.documentInstances._resolveReviewerName, {
            reviewerId: args.assignedReviewerId,
          });
          patch.assignedReviewerName = reviewerName;
        } catch (e) {
          console.error("[documentInstances.updateStatus] Reviewer name resolution FAILED:", e);
          patch.assignedReviewerName = "";
        }
      }
    }

    await db.patch("documentInstances", args.id, patch);
  },
});

export const _resolveReviewerName = internalMutation({
  args: { reviewerId: v.string() },
  handler: async (ctx, args) => {
    const reviewer = await ctx.db.get(args.reviewerId as Id<"users">);
    return reviewer?.name ?? "";
  },
});

export const sign = action({
  args: {
    id: v.string(),
    slotId: v.string(),
    signatureData: v.string(),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const instance = await db.get("documentInstances", args.id);
    if (!instance) throw new Error("Document not found");
    if (instance.status !== "pending_signature" && instance.status !== "approved") {
      throw new Error("Document is not in a signable state");
    }

    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: instance.organizationId as string },
    );

    const now = Date.now();

    let signatures: any[];
    if (typeof instance.signatures === "string") {
      signatures = JSON.parse(instance.signatures);
    } else {
      signatures = [...(instance.signatures as any[])];
    }

    const slotIndex = signatures.findIndex((s: any) => s.slotId === args.slotId);
    if (slotIndex === -1) throw new Error("Signature slot not found");
    if (signatures[slotIndex].signatureData) throw new Error("Slot already signed");

    signatures[slotIndex] = {
      ...signatures[slotIndex],
      signatureData: args.signatureData,
      signedByUserId: String(authResult.userId),
      signedByName: authResult.userName ?? "",
      signedAt: now,
    };

    const allSigned = signatures.every((s: any) => s.signatureData);

    await db.patch("documentInstances", args.id, {
      signatures: JSON.stringify(signatures),
      status: allSigned ? "signed" : instance.status,
      updatedAt: now,
    });
  },
});

export const createFromFile = action({
  args: {
    organizationId: v.id("organizations"),
    title: v.string(),
    fileId: v.string(),
    fileName: v.string(),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    category: v.optional(v.string()),
    module: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const now = Date.now();

    // Resolve file URL via side effect
    let fileUrl: string | undefined;
    try {
      fileUrl = await ctx.runMutation(internal.documentInstances._resolveFileUrl, {
        fileId: args.fileId,
      }) ?? undefined;
    } catch (e) {
      console.error("[documentInstances.createFromFile] File URL resolution FAILED:", e);
    }

    const db = createSupabaseDb();
    const instanceId = await db.insert("documentInstances", {
      organizationId: String(args.organizationId),
      type: "file",
      title: args.title,
      fileId: args.fileId,
      fileUrl: fileUrl ?? null,
      fileName: args.fileName,
      mimeType: args.mimeType ?? null,
      fileSize: args.fileSize ?? null,
      category: args.category ?? null,
      module: args.module ?? null,
      status: "draft",
      signatures: JSON.stringify([]),
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    return instanceId;
  },
});

export const generateUploadUrl = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    // generateUploadUrl must run in mutation context — delegate
    return await ctx.runMutation(internal.documentInstances._generateUploadUrl, {
      organizationId: args.organizationId,
    });
  },
});

export const _generateUploadUrl = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, _args) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const remove = action({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const instance = await db.get("documentInstances", args.id);
    if (!instance) throw new Error("Document not found");
    if (NON_EDITABLE_STATUSES.includes(instance.status as string)) {
      throw new Error("Podpisanych i zarchiwizowanych dokumentów nie można usunąć");
    }

    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: instance.organizationId as string },
    );

    await db.delete("documentInstances", args.id);
  },
});
