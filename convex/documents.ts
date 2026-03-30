import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { checkPermission } from "./_helpers/permissions";
import { documentCategoryValidator, documentStatusValidator } from "@cvx/schema";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeDocumentRef = internal.supabase.documents.writeDocumentToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateDocumentRef = internal.supabase.documents.updateDocumentInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const deleteDocumentRef = internal.supabase.documents.deleteDocumentFromSupabase;

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    category: v.optional(documentCategoryValidator),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "documents", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const isOwn = perm.scope === "own";
    const ownFilter = (r: any) => r.createdBy === user._id;

    if (args.search) {
      const results = await ctx.db
        .query("documents")
        .withSearchIndex("search_documents", (q) =>
          q.search("name", args.search!).eq("organizationId", args.organizationId)
        )
        .take(50);
      if (isOwn) {
        return { page: results.filter(ownFilter), isDone: true, continueCursor: "" };
      }
      return { page: results, isDone: true, continueCursor: "" };
    }

    if (args.category) {
      const result = await ctx.db
        .query("documents")
        .withIndex("by_orgAndCategory", (q) =>
          q.eq("organizationId", args.organizationId).eq("category", args.category!)
        )
        .order("desc")
        .paginate(args.paginationOpts);
      if (isOwn) {
        return { ...result, page: result.page.filter(ownFilter) };
      }
      return result;
    }

    const result = await ctx.db
      .query("documents")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
    if (isOwn) {
      return { ...result, page: result.page.filter(ownFilter) };
    }
    return result;
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "documents", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId) {
      throw new Error("Document not found");
    }
    if (perm.scope === "own" && doc.createdBy !== user._id) {
      throw new Error("Permission denied");
    }

    const customFieldValues = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "document").eq("entityId", args.documentId)
      )
      .collect();

    return { ...doc, customFieldValues };
  },
});

export const create = mutation({
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
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "documents", "create");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();

    const docId = await ctx.db.insert("documents", {
      ...args,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "document",
      entityId: docId,
      action: "document_uploaded",
      description: `Uploaded document "${args.name}"`,
      performedBy: user._id,
    });

    // Dual-write: replicate new document to Supabase
    await ctx.scheduler.runAfter(0, writeDocumentRef, {
      documentId: docId as string,
      organizationId: args.organizationId as string,
      name: args.name,
      description: args.description,
      fileId: args.fileId,
      fileUrl: args.fileUrl,
      mimeType: args.mimeType,
      fileSize: args.fileSize,
      category: args.category,
      tags: args.tags,
      tagIds: args.tagIds?.map((id) => id as string),
      categoryId: args.categoryId as string | undefined,
      status: args.status,
      amount: args.amount,
      createdBy: user._id as string,
      createdAt: now,
      updatedAt: now,
    });

    return docId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("documents"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(documentCategoryValidator),
    tags: v.optional(v.array(v.string())),
    status: v.optional(documentStatusValidator),
    amount: v.optional(v.number()),
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "documents", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId) {
      throw new Error("Document not found");
    }
    if (perm.scope === "own" && doc.createdBy !== user._id) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const { organizationId, documentId, ...updates } = args;
    const now = Date.now();
    await ctx.db.patch(documentId, { ...updates, updatedAt: now });

    await logActivity(ctx, {
      organizationId,
      entityType: "document",
      entityId: documentId,
      action: "updated",
      description: `Updated document "${doc.name}"`,
      performedBy: user._id,
    });

    // Dual-write: replicate update to Supabase
    await ctx.scheduler.runAfter(0, updateDocumentRef, {
      documentId: documentId as string,
      organizationId: organizationId as string,
      ...Object.fromEntries(
        Object.entries(updates).map(([k, val]) => {
          if (k === "tagIds" && Array.isArray(val)) return [k, val.map((id) => id as string)];
          if (k === "categoryId" && val) return [k, val as string];
          return [k, val];
        })
      ),
      updatedAt: now,
    });

    return documentId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "documents", "delete");
    if (!perm.allowed) throw new Error("Permission denied");

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId) {
      throw new Error("Document not found");
    }
    if (perm.scope === "own" && doc.createdBy !== user._id) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    const customValues = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "document").eq("entityId", args.documentId)
      )
      .collect();
    for (const cv of customValues) {
      await ctx.db.delete(cv._id);
    }

    // Dual-write: schedule delete from Supabase BEFORE removing from Convex
    await ctx.scheduler.runAfter(0, deleteDocumentRef, {
      documentId: args.documentId as string,
      organizationId: args.organizationId as string,
    });

    await ctx.db.delete(args.documentId);

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "document",
      entityId: args.documentId,
      action: "deleted",
      description: `Deleted document "${doc.name}"`,
      performedBy: user._id,
    });

    return args.documentId;
  },
});

export const updateStatus = mutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("documents"),
    status: documentStatusValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "documents", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId) {
      throw new Error("Document not found");
    }
    if (perm.scope === "own" && doc.createdBy !== user._id) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const now = Date.now();
    const updateData: Record<string, any> = {
      status: args.status,
      updatedAt: now,
    };

    if (args.status === "sent") {
      updateData.sentAt = now;
    } else if (args.status === "accepted") {
      updateData.acceptedAt = now;
    }

    await ctx.db.patch(args.documentId, updateData);

    // Dual-write: replicate status change to Supabase
    await ctx.scheduler.runAfter(0, updateDocumentRef, {
      documentId: args.documentId as string,
      organizationId: args.organizationId as string,
      status: args.status,
      sentAt: updateData.sentAt,
      acceptedAt: updateData.acceptedAt,
      updatedAt: now,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "document",
      entityId: args.documentId,
      action: "status_changed",
      description: `Changed document "${doc.name}" status to "${args.status}"`,
      metadata: { oldStatus: doc.status, newStatus: args.status },
      performedBy: user._id,
    });

    return args.documentId;
  },
});

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
