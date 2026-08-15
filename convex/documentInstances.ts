import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { createSupabaseDb } from "./_helpers/supabaseDb";
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

export const list = action({
  args: {
    organizationId: v.string(),
    status: v.optional(statusValidator),
    module: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    let q = db.query("documentInstances")
      .eq("organizationId", args.organizationId)
      .order("createdAt", false);

    if (args.status) q = q.eq("status", args.status);
    if (args.module) q = q.eq("module", args.module);

    return await q.collect();
  },
});

export const getById = action({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const instance = await db.get("documentInstances", args.id);
    if (!instance) return null;
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: instance.organizationId as string,
    });
    return instance;
  },
});

export const listBySource = action({
  args: {
    organizationId: v.string(),
    sourceKey: v.string(),
    sourceInstanceId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const all = await db.query("documentInstances")
      .eq("organizationId", args.organizationId)
      .order("createdAt", false)
      .collect();

    return all.filter((d) => {
      const raw = d.resolvedSources;
      const sources = (typeof raw === "string"
        ? JSON.parse(raw)
        : raw) as Record<string, string> | undefined;
      return sources?.[args.sourceKey] === args.sourceInstanceId;
    });
  },
});

// ---------------------------------------------------------------------------
// Actions (Supabase-primary)
// ---------------------------------------------------------------------------

export const create = action({
  args: {
    organizationId: v.string(),
    templateId: v.string(),
    title: v.string(),
    sources: v.any(),
    fieldOverrides: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<string> => {
    const authResult = await ctx.runAction(
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
    organizationId: v.string(),
    templateId: v.string(),
    title: v.string(),
    sources: v.any(),
    fieldOverrides: v.optional(v.any()),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const db = createSupabaseDb();

    const template = await db.get("documentTemplates", args.templateId);
    if (!template) throw new Error("Template not found");
    if (template.status !== "active") throw new Error("Template is not active");

    const fields = await db.query("documentTemplateFields")
      .eq("templateId", args.templateId)
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
      const fieldKey = field.fieldKey as string;
      const binding = field.binding
        ? (typeof field.binding === "string"
          ? JSON.parse(field.binding) as { source: string; field: string }
          : field.binding as { source: string; field: string })
        : null;
      if (overrides[fieldKey] !== undefined) {
        fieldValues[fieldKey] = overrides[fieldKey];
      } else if (binding) {
        const sourceData = resolvedData[binding.source];
        fieldValues[fieldKey] = sourceData?.[binding.field] ?? "";
      } else if (field.defaultValue != null) {
        fieldValues[fieldKey] = field.defaultValue;
      } else {
        fieldValues[fieldKey] = "";
      }
    }

    const signatureSlots = typeof template.signatureSlots === "string"
      ? JSON.parse(template.signatureSlots) as Array<{ id: string; label: string; verificationMethod: string; signerType: string }>
      : template.signatureSlots as Array<{ id: string; label: string; verificationMethod: string; signerType: string }>;

    const renderedContent = renderTemplate(template.content as string, fieldValues);

    const signatures = signatureSlots.map((slot) => ({
      slotId: slot.id,
      slotLabel: slot.label,
      verificationMethod: slot.verificationMethod,
      signerType: slot.signerType,
    }));

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
  handler: async (ctx, args): Promise<void> => {
    const db = createSupabaseDb();
    const instance = await db.get("documentInstances", args.id);
    if (!instance) throw new Error("Document not found");
    if (NON_EDITABLE_STATUSES.includes(instance.status as string)) {
      throw new Error("Podpisanych i zarchiwizowanych dokumentów nie można edytować");
    }

    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: String(instance.organizationId) },
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
  handler: async (ctx, args): Promise<void> => {
    const db = createSupabaseDb();
    const instance = await db.get("documentInstances", args.id);
    if (!instance) throw new Error("Document not found");

    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: String(instance.organizationId) },
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
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    const reviewer = await db.get("users", args.reviewerId);
    return (reviewer?.name as string) ?? "";
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

    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: String(instance.organizationId) },
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
    organizationId: v.string(),
    title: v.string(),
    fileId: v.string(),
    fileName: v.string(),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    category: v.optional(v.string()),
    module: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const authResult = await ctx.runAction(
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
  args: { organizationId: v.string() },
  handler: async (ctx, args): Promise<string> => {
    await ctx.runAction(
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
  args: { organizationId: v.string() },
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

    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: String(instance.organizationId) },
    );

    await db.delete("documentInstances", args.id);
  },
});
