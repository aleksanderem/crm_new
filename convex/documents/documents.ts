import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { verifyOrgAccess } from "../_helpers/auth";
import { validatePortalSession } from "../_helpers/portalSession";
import { formDocumentStatusValidator } from "../schema/documents";
import { resolveComponentsInContent } from "./resolveComponents";

export const listAll = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(formDocumentStatusValidator),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    if (args.status) {
      return await ctx.db
        .query("formDocuments")
        .withIndex("by_orgAndStatus", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("status", args.status!),
        )
        .order("desc")
        .collect();
    }
    return await ctx.db
      .query("formDocuments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .collect();
  },
});

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
    // Return document data for any active status — the frontend decides
    // what to render based on status (fill form, sign, or show success).

    // Also fetch template for rendering, with components resolved
    const template = await ctx.db.get(doc.templateId);
    if (template?.contentJson) {
      const resolved = await resolveComponentsInContent(ctx, template.contentJson);
      return { document: doc, template: { ...template, contentJson: resolved } };
    }
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

// Submit form field values for document-type templates (public, token-based).
// Transitions status from "draft" → "pending_signature" after storing the
// rendered HTML and form field values.
export const submitDocumentFormFields = mutation({
  args: {
    token: v.string(),
    renderedHtml: v.string(),
    formFieldValues: v.string(), // JSON map of field values
    scopeData: v.optional(v.string()), // JSON map of scope/variable data for re-rendering
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("formDocuments")
      .withIndex("by_signingToken", (q) => q.eq("signingToken", args.token))
      .first();
    if (!doc) throw new Error("Document not found");
    if (doc.signingTokenExpiresAt && doc.signingTokenExpiresAt < Date.now())
      throw new Error("Signing link expired");
    if (doc.status !== "draft" && doc.status !== "pending_signature")
      throw new Error("Document is not in a fillable status");

    // Preserve scope data: prefer frontend-supplied, fall back to extracting
    // from the current responseData (which IS the scope data before first submit)
    let scopeData: Record<string, unknown> | undefined;
    if (args.scopeData) {
      scopeData = JSON.parse(args.scopeData);
    } else {
      try {
        const existing = JSON.parse(doc.responseData);
        // If no html yet, current responseData is the raw scope data map
        if (!existing.html) {
          scopeData = existing;
        } else if (existing.scopeData) {
          // Already submitted before — reuse stored scope data
          scopeData = existing.scopeData as Record<string, unknown>;
        }
      } catch {
        // ignore parse errors
      }
    }

    const responseObj: Record<string, unknown> = {
      html: args.renderedHtml,
      formFieldValues: JSON.parse(args.formFieldValues),
    };
    if (scopeData) {
      responseObj.scopeData = scopeData;
    }

    await ctx.db.patch(doc._id, {
      responseData: JSON.stringify(responseObj),
      status: "pending_signature",
      updatedAt: Date.now(),
    });
    return doc._id;
  },
});

// ---------------------------------------------------------------------------
// Employee fills form fields internally (authenticated).
// Stores rendered HTML + form field values, transitions draft → pending_signature,
// and sends signing email to the patient. Used for after_completion documents
// where the employee fills first, then the client signs.
// ---------------------------------------------------------------------------

export const submitEmployeeFormFields = mutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("formDocuments"),
    renderedHtml: v.string(),
    formFieldValues: v.string(), // JSON map of field values
    scopeData: v.optional(v.string()), // JSON map of scope data
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId)
      throw new Error("Document not found");
    if (doc.status !== "draft")
      throw new Error("Document is not in draft status");

    // Build response data preserving scope
    let scopeData: Record<string, unknown> | undefined;
    if (args.scopeData) {
      scopeData = JSON.parse(args.scopeData);
    } else {
      try {
        const existing = JSON.parse(doc.responseData);
        if (!existing.html) {
          scopeData = existing;
        } else if (existing.scopeData) {
          scopeData = existing.scopeData as Record<string, unknown>;
        }
      } catch {
        // ignore
      }
    }

    const responseObj: Record<string, unknown> = {
      html: args.renderedHtml,
      formFieldValues: JSON.parse(args.formFieldValues),
    };
    if (scopeData) {
      responseObj.scopeData = scopeData;
    }

    await ctx.db.patch(args.documentId, {
      responseData: JSON.stringify(responseObj),
      status: "pending_signature",
      updatedAt: Date.now(),
    });

    // Send signing email to patient now that employee has filled the form.
    // Look up patient from the linked entity (appointment or patient).
    if (doc.signingToken) {
      let recipientEmail: string | undefined;
      let recipientName: string | undefined;

      if (doc.entityType === "appointment" && doc.entityId) {
        const appointment = await ctx.db.get(doc.entityId as any);
        if (appointment && typeof appointment === "object") {
          const appt = appointment as { patientId?: any };
          if (appt.patientId) {
            const patient = await ctx.db.get(appt.patientId);
            if (patient && typeof patient === "object") {
              const p = patient as {
                email?: string;
                firstName?: string;
                lastName?: string;
              };
              recipientEmail = p.email;
              recipientName = [p.firstName, p.lastName]
                .filter(Boolean)
                .join(" ") || undefined;
            }
          }
        }
      } else if (doc.entityType === "patient" && doc.entityId) {
        const patient = await ctx.db.get(doc.entityId as any);
        if (patient && typeof patient === "object") {
          const p = patient as {
            email?: string;
            firstName?: string;
            lastName?: string;
          };
          recipientEmail = p.email;
          recipientName = [p.firstName, p.lastName]
            .filter(Boolean)
            .join(" ") || undefined;
        }
      }

      if (recipientEmail) {
        await ctx.scheduler.runAfter(
          0,
          // @ts-ignore — deep type instantiation under app tsconfig
          internal.documents.signing.sendSigningEmailInternal,
          {
            documentId: args.documentId,
            recipientEmail,
            recipientName,
          },
        );
      }
    }

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
    // For document-type templates: store rendered HTML at signing time
    resolvedHtml: v.optional(v.string()),
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
    const patch: Record<string, unknown> = {
      status: "signed",
      signatureData: args.signatureData,
      signedAt: now,
      signedByName: args.signedByName,
      signedByEmail: args.signedByEmail,
      signedByIp: args.signedByIp,
      updatedAt: now,
    };

    // For document-type templates without form fields: store the resolved HTML
    // rendered client-side so it's available for later viewing
    if (args.resolvedHtml) {
      try {
        const existing = JSON.parse(doc.responseData);
        if (!existing.html) {
          patch.responseData = JSON.stringify({
            ...existing,
            html: args.resolvedHtml,
            formFieldValues: existing.formFieldValues ?? {},
          });
        }
      } catch {
        patch.responseData = JSON.stringify({
          html: args.resolvedHtml,
          formFieldValues: {},
        });
      }
    }

    await ctx.db.patch(doc._id, patch);
    return doc._id;
  },
});

// ---------------------------------------------------------------------------
// Resend signing email (authenticated — staff action from appointment view)
// ---------------------------------------------------------------------------

export const resendSigningEmail = mutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("formDocuments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId)
      throw new Error("Document not found");
    if (doc.status !== "draft" && doc.status !== "pending_signature")
      throw new Error("Document is not awaiting signature");
    if (!doc.signingToken)
      throw new Error("Document has no signing token");

    // Look up patient email from the linked entity
    let recipientEmail: string | undefined;
    let recipientName: string | undefined;

    if (doc.entityType === "appointment" && doc.entityId) {
      const appointment = await ctx.db.get(
        doc.entityId as any,
      );
      if (appointment && typeof appointment === "object") {
        const appt = appointment as { patientId?: any };
        if (appt.patientId) {
          const patient = await ctx.db.get(appt.patientId);
          if (patient && typeof patient === "object") {
            const p = patient as { email?: string; firstName?: string; lastName?: string };
            recipientEmail = p.email;
            recipientName = [p.firstName, p.lastName].filter(Boolean).join(" ") || undefined;
          }
        }
      }
    } else if (doc.entityType === "patient" && doc.entityId) {
      const patient = await ctx.db.get(doc.entityId as any);
      if (patient && typeof patient === "object") {
        const p = patient as { email?: string; firstName?: string; lastName?: string };
        recipientEmail = p.email;
        recipientName = [p.firstName, p.lastName].filter(Boolean).join(" ") || undefined;
      }
    }

    if (!recipientEmail) {
      throw new Error("Nie znaleziono adresu e-mail pacjenta");
    }

    await ctx.scheduler.runAfter(
      0,
      internal.documents.signing.sendSigningEmailInternal,
      {
        documentId: args.documentId,
        recipientEmail,
        recipientName,
      },
    );

    return { sent: true };
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("formDocuments"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(
      ctx,
      args.organizationId,
      "documents",
      "delete",
    );
    if (!perm.allowed) throw new Error("Permission denied");

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId) {
      throw new Error("Document not found");
    }
    if (perm.scope === "own" && doc.createdBy !== user._id) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    await ctx.db.delete(args.documentId);
    return args.documentId;
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
