import { query, mutation, action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";

import { documentCategoryValidator, documentStatusValidator } from "@cvx/schema";
import type { Id } from "./_generated/dataModel";

// Dual-write refs removed — Supabase is primary for document writes

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    fileId: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    category: v.optional(documentCategoryValidator),
    tags: v.optional(v.array(v.string())),
    status: v.optional(documentStatusValidator),
    amount: v.optional(v.number()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "documents", action: "create" },
    );
    if (!perm.allowed) throw new Error("Permission denied");

    const now = Date.now();
    const db = createSupabaseDb();

    const docId = await db.insert("documents", {
      organizationId: String(args.organizationId),
      name: args.name,
      description: args.description ?? null,
      fileId: args.fileId ?? null,
      fileUrl: args.fileUrl ?? null,
      mimeType: args.mimeType ?? null,
      fileSize: args.fileSize ?? null,
      category: args.category ?? null,
      tags: args.tags ?? null,
      status: args.status ?? null,
      amount: args.amount ?? null,
      tagIds: args.tagIds ?? null,
      categoryId: args.categoryId ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    try {
      await ctx.runMutation(internal.crm.documents._createSideEffects, {
        organizationId: args.organizationId,
        documentId: docId,
        name: args.name,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[documents.create] Side effects FAILED for document", docId, ":", e);
    }

    return docId;
  },
});

export const _createSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.string(),
    name: v.string(),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "document",
      entityId: args.documentId,
      action: "document_uploaded",
      description: `Uploaded document "${args.name}"`,
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(documentCategoryValidator),
    tags: v.optional(v.array(v.string())),
    status: v.optional(documentStatusValidator),
    amount: v.optional(v.number()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "documents", action: "edit" },
    );
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const doc = await db.get("documents", args.documentId);
    if (!doc || String(doc.organizationId) !== String(args.organizationId)) {
      throw new Error("Document not found");
    }
    if (perm.scope === "own" && String(doc.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const { organizationId, documentId, ...updates } = args;
    const now = Date.now();

    const cleanUpdates: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) cleanUpdates[k] = val;
    }
    cleanUpdates.updatedAt = now;

    await db.patch("documents", documentId, cleanUpdates);

    try {
      await ctx.runMutation(internal.crm.documents._updateSideEffects, {
        organizationId,
        documentId,
        name: doc.name as string,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[documents.update] Side effects FAILED for document", documentId, ":", e);
    }

    return documentId;
  },
});

export const _updateSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.string(),
    name: v.string(),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "document",
      entityId: args.documentId,
      action: "updated",
      description: `Updated document "${args.name}"`,
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "documents", action: "delete" },
    );
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const doc = await db.get("documents", args.documentId);
    if (!doc || String(doc.organizationId) !== String(args.organizationId)) {
      throw new Error("Document not found");
    }
    if (perm.scope === "own" && String(doc.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    // Delete custom field values from Supabase
    const cfValues = await db.query("customFieldValues")
      .eq("entityType", "document")
      .eq("entityId", args.documentId)
      .collect();
    for (const cv of cfValues) {
      await db.delete("customFieldValues", String(cv._id));
    }

    // Delete document from Supabase
    await db.delete("documents", args.documentId);

    try {
      await ctx.runMutation(internal.crm.documents._removeSideEffects, {
        organizationId: args.organizationId,
        documentId: args.documentId,
        name: doc.name as string,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[documents.remove] Side effects FAILED for document", args.documentId, ":", e);
    }

    return args.documentId;
  },
});

export const _removeSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.string(),
    name: v.string(),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "document",
      entityId: args.documentId,
      action: "deleted",
      description: `Deleted document "${args.name}"`,
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});

export const updateStatus = action({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.string(),
    status: documentStatusValidator,
  },
  handler: async (ctx, args): Promise<string> => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "documents", action: "edit" },
    );
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const doc = await db.get("documents", args.documentId);
    if (!doc || String(doc.organizationId) !== String(args.organizationId)) {
      throw new Error("Document not found");
    }
    if (perm.scope === "own" && String(doc.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const now = Date.now();
    const updateData: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    if (args.status === "sent") {
      updateData.sentAt = now;
    } else if (args.status === "accepted") {
      updateData.acceptedAt = now;
    }

    await db.patch("documents", args.documentId, updateData);

    try {
      await ctx.runMutation(internal.crm.documents._updateStatusSideEffects, {
        organizationId: args.organizationId,
        documentId: args.documentId,
        name: doc.name as string,
        oldStatus: (doc.status as string) ?? null,
        newStatus: args.status,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[documents.updateStatus] Side effects FAILED for document", args.documentId, ":", e);
    }

    return args.documentId;
  },
});

export const _updateStatusSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.string(),
    name: v.string(),
    oldStatus: v.union(v.string(), v.null()),
    newStatus: v.string(),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "document",
      entityId: args.documentId,
      action: "status_changed",
      description: `Changed document "${args.name}" status to "${args.newStatus}"`,
      metadata: { oldStatus: args.oldStatus, newStatus: args.newStatus },
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});

// Storage upload URL generation — stays as mutation (needs ctx.storage)
export const generateUploadUrl = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getFileUrl = query({
  args: {
    organizationId: v.id("organizations"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.storage.getUrl(args.storageId);
  },
});
