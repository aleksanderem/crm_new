import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "../_helpers/auth";
import { formDocumentStatusValidator } from "../schema/documents";

export const listByEntity = query({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("formDocuments")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId),
      )
      .collect();
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("formDocuments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId)
      throw new Error("Document not found");
    return doc;
  },
});

// Get document by signing token (no auth required -- public signing page)
export const getBySigningToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("formDocuments")
      .withIndex("by_signingToken", (q) => q.eq("signingToken", args.token))
      .first();
    if (!doc) throw new Error("Document not found");
    if (doc.signingTokenExpiresAt && doc.signingTokenExpiresAt < Date.now())
      throw new Error("Signing link expired");
    if (doc.status !== "pending_signature")
      throw new Error("Document is not awaiting signature");

    // Also fetch template for rendering
    const template = await ctx.db.get(doc.templateId);
    return { document: doc, template };
  },
});

export const listByTemplate = query({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("formTemplates"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("formDocuments")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .collect();
  },
});

export const listByStatus = query({
  args: {
    organizationId: v.id("organizations"),
    status: formDocumentStatusValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("formDocuments")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", args.status),
      )
      .collect();
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("formTemplates"),
    title: v.string(),
    responseData: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    scopeEntities: v.optional(v.string()),
    status: formDocumentStatusValidator,
    signingToken: v.optional(v.string()),
    signingTokenExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    // Verify template exists and belongs to this org
    const template = await ctx.db.get(args.templateId);
    if (!template || template.organizationId !== args.organizationId)
      throw new Error("Template not found");

    const now = Date.now();
    return await ctx.db.insert("formDocuments", {
      ...args,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStatus = mutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("formDocuments"),
    status: formDocumentStatusValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId)
      throw new Error("Document not found");

    await ctx.db.patch(args.documentId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return args.documentId;
  },
});

export const updateResponseData = mutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("formDocuments"),
    responseData: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId)
      throw new Error("Document not found");
    if (doc.status !== "draft")
      throw new Error("Can only update response data on draft documents");

    await ctx.db.patch(args.documentId, {
      responseData: args.responseData,
      updatedAt: Date.now(),
    });
    return args.documentId;
  },
});

export const recordSignature = mutation({
  args: {
    token: v.string(),
    signatureData: v.string(),
    signedByName: v.string(),
    signedByEmail: v.optional(v.string()),
    signedByIp: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("formDocuments")
      .withIndex("by_signingToken", (q) => q.eq("signingToken", args.token))
      .first();
    if (!doc) throw new Error("Document not found");
    if (doc.signingTokenExpiresAt && doc.signingTokenExpiresAt < Date.now())
      throw new Error("Signing link expired");
    if (doc.status !== "pending_signature")
      throw new Error("Document is not awaiting signature");

    const now = Date.now();
    await ctx.db.patch(doc._id, {
      status: "signed",
      signatureData: args.signatureData,
      signedAt: now,
      signedByName: args.signedByName,
      signedByEmail: args.signedByEmail,
      signedByIp: args.signedByIp,
      updatedAt: now,
    });
    return doc._id;
  },
});
