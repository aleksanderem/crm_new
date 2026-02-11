import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { documentCategoryValidator } from "@cvx/schema";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    category: v.optional(documentCategoryValidator),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    if (args.search) {
      const results = await ctx.db
        .query("documents")
        .withSearchIndex("search_documents", (q) =>
          q.search("name", args.search!).eq("organizationId", args.organizationId)
        )
        .take(50);
      return { page: results, isDone: true, continueCursor: "" };
    }

    if (args.category) {
      return await ctx.db
        .query("documents")
        .withIndex("by_orgAndCategory", (q) =>
          q.eq("organizationId", args.organizationId).eq("category", args.category!)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("documents")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId) {
      throw new Error("Document not found");
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
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
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
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId) {
      throw new Error("Document not found");
    }

    const { organizationId, documentId, ...updates } = args;
    await ctx.db.patch(documentId, { ...updates, updatedAt: Date.now() });

    await logActivity(ctx, {
      organizationId,
      entityType: "document",
      entityId: documentId,
      action: "updated",
      description: `Updated document "${doc.name}"`,
      performedBy: user._id,
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

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId) {
      throw new Error("Document not found");
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
