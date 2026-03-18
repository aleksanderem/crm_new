import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "../_helpers/auth";
import { validatePortalSession } from "../_helpers/portalSession";
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

// ---------------------------------------------------------------------------
// Patient-portal query (token-based auth, no org context)
// ---------------------------------------------------------------------------

/**
 * List formDocuments accessible to a patient through the portal.
 * Looks up documents linked to the patient entity, plus documents linked to
 * any of the patient's appointments.
 */
export const listByPatientToken = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const { patientId, organizationId } = await validatePortalSession(
      ctx,
      args.tokenHash,
    );

    // 1. Documents linked directly to the patient
    const patientDocs = await ctx.db
      .query("formDocuments")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "patient").eq("entityId", patientId),
      )
      .collect();

    // 2. Documents linked to the patient's appointments
    const appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndPatient", (q) =>
        q.eq("organizationId", organizationId).eq("patientId", patientId),
      )
      .collect();

    const appointmentDocArrays = await Promise.all(
      appointments.map((appt) =>
        ctx.db
          .query("formDocuments")
          .withIndex("by_entity", (q) =>
            q.eq("entityType", "appointment").eq("entityId", appt._id),
          )
          .collect(),
      ),
    );

    // Merge & deduplicate
    const allDocs = [...patientDocs, ...appointmentDocArrays.flat()];
    const seen = new Set<string>();
    const unique = allDocs.filter((d) => {
      if (d.organizationId !== organizationId) return false;
      if (seen.has(d._id)) return false;
      seen.add(d._id);
      return true;
    });

    // Enrich with template info for frontend rendering
    const enriched = await Promise.all(
      unique.map(async (doc) => {
        const template = await ctx.db.get(doc.templateId);
        return {
          _id: doc._id,
          title: doc.title,
          status: doc.status,
          entityType: doc.entityType,
          entityId: doc.entityId,
          responseData: doc.responseData,
          signatureData: doc.signatureData,
          signedAt: doc.signedAt,
          signingToken: doc.signingToken,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          templateName: template?.name ?? "",
          category: template?.category ?? "custom",
          formJson: template?.formJson ?? "{}",
          requiresSignature: template?.requiresSignature ?? false,
        };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});
