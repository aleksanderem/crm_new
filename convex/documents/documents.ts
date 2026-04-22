import { query, action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { verifyOrgAccess } from "../_helpers/auth";
import { validatePortalSession } from "../_helpers/portalSession";
import { formDocumentStatusValidator } from "../schema/documents";
import { resolveComponentsInContent } from "./resolveComponents";
import { Id } from "../_generated/dataModel";
import { checkPermission } from "../_helpers/permissions";

// Dual-write refs removed — Supabase is now primary for document writes

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

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.string(),
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
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const now = Date.now();
    const db = createSupabaseDb();

    const docId = await db.insert("formDocuments", {
      organizationId: String(args.organizationId),
      templateId: args.templateId,
      title: args.title,
      responseData: args.responseData,
      entityType: args.entityType,
      entityId: args.entityId,
      scopeEntities: args.scopeEntities ?? null,
      status: args.status,
      signingToken: args.signingToken ?? null,
      signingTokenExpiresAt: args.signingTokenExpiresAt ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    return docId;
  },
});

export const updateStatus = action({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.string(),
    status: formDocumentStatusValidator,
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const doc = await db.get("formDocuments", args.documentId);
    if (!doc || String(doc.organizationId) !== String(args.organizationId))
      throw new Error("Document not found");

    await db.patch("formDocuments", args.documentId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return args.documentId;
  },
});

export const updateResponseData = action({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.string(),
    responseData: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const doc = await db.get("formDocuments", args.documentId);
    if (!doc || String(doc.organizationId) !== String(args.organizationId))
      throw new Error("Document not found");
    if (doc.status !== "draft")
      throw new Error("Can only update response data on draft documents");

    await db.patch("formDocuments", args.documentId, {
      responseData: args.responseData,
      updatedAt: Date.now(),
    });
    return args.documentId;
  },
});

// Submit form field values for document-type templates (public, token-based).
// Transitions status from "draft" → "pending_signature" after storing the
// rendered HTML and form field values.
export const submitDocumentFormFields = action({
  args: {
    token: v.string(),
    renderedHtml: v.string(),
    formFieldValues: v.string(), // JSON map of field values
    scopeData: v.optional(v.string()), // JSON map of scope/variable data for re-rendering
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    const doc = await db.query("formDocuments")
      .eq("signingToken", args.token)
      .first();
    if (!doc) throw new Error("Document not found");
    if (doc.signingTokenExpiresAt && (doc.signingTokenExpiresAt as number) < Date.now())
      throw new Error("Signing link expired");
    if (doc.status !== "draft" && doc.status !== "pending_signature")
      throw new Error("Document is not in a fillable status");

    // Preserve scope data
    let scopeData: Record<string, unknown> | undefined;
    if (args.scopeData) {
      scopeData = JSON.parse(args.scopeData);
    } else {
      try {
        const existing = JSON.parse(doc.responseData as string);
        if (!existing.html) {
          scopeData = existing;
        } else if (existing.scopeData) {
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

    await db.patch("formDocuments", doc._id as string, {
      responseData: JSON.stringify(responseObj),
      status: "pending_signature",
      updatedAt: Date.now(),
    });
    return doc._id as string;
  },
});

// ---------------------------------------------------------------------------
// Employee fills form fields internally (authenticated).
// ---------------------------------------------------------------------------

export const submitEmployeeFormFields = action({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.string(),
    renderedHtml: v.string(),
    formFieldValues: v.string(),
    scopeData: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const doc = await db.get("formDocuments", args.documentId);
    if (!doc || String(doc.organizationId) !== String(args.organizationId))
      throw new Error("Document not found");
    if (doc.status !== "draft")
      throw new Error("Document is not in draft status");

    // Build response data preserving scope
    let scopeData: Record<string, unknown> | undefined;
    if (args.scopeData) {
      scopeData = JSON.parse(args.scopeData);
    } else {
      try {
        const existing = JSON.parse(doc.responseData as string);
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

    await db.patch("formDocuments", args.documentId, {
      responseData: JSON.stringify(responseObj),
      status: "pending_signature",
      updatedAt: Date.now(),
    });

    // Send signing email to patient — delegate to side effects
    if (doc.signingToken) {
      try {
        await ctx.runMutation(internal.documents.documents._submitEmployeeSideEffects, {
          documentId: args.documentId,
          entityType: doc.entityType as string,
          entityId: doc.entityId as string,
          signingToken: doc.signingToken as string,
        });
      } catch (e) {
        console.error("[documents.submitEmployeeFormFields] Side effects FAILED:", e);
      }
    }

    return args.documentId;
  },
});

export const _submitEmployeeSideEffects = internalMutation({
  args: {
    documentId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    signingToken: v.string(),
  },
  handler: async (ctx, args) => {
    let recipientEmail: string | undefined;
    let recipientName: string | undefined;

    if (args.entityType === "appointment" && args.entityId) {
      const appointment = await ctx.db.get(args.entityId as any);
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
    } else if (args.entityType === "patient" && args.entityId) {
      const patient = await ctx.db.get(args.entityId as any);
      if (patient && typeof patient === "object") {
        const p = patient as { email?: string; firstName?: string; lastName?: string };
        recipientEmail = p.email;
        recipientName = [p.firstName, p.lastName].filter(Boolean).join(" ") || undefined;
      }
    }

    if (recipientEmail) {
      await ctx.scheduler.runAfter(
        0,
        // @ts-ignore — deep type instantiation under app tsconfig
        internal.documents.signing.sendSigningEmailInternal,
        {
          documentId: args.documentId as Id<"formDocuments">,
          recipientEmail,
          recipientName,
        },
      );
    }
  },
});

export const recordSignature = action({
  args: {
    token: v.string(),
    signatureData: v.string(),
    signedByName: v.string(),
    signedByEmail: v.optional(v.string()),
    signedByIp: v.optional(v.string()),
    resolvedHtml: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    const doc = await db.query("formDocuments")
      .eq("signingToken", args.token)
      .first();
    if (!doc) throw new Error("Document not found");
    if (doc.signingTokenExpiresAt && (doc.signingTokenExpiresAt as number) < Date.now())
      throw new Error("Signing link expired");
    if (doc.status !== "pending_signature")
      throw new Error("Document is not awaiting signature");

    const now = Date.now();
    const patch: Record<string, unknown> = {
      status: "signed",
      signatureData: args.signatureData,
      signedAt: now,
      signedByName: args.signedByName,
      signedByEmail: args.signedByEmail ?? null,
      signedByIp: args.signedByIp ?? null,
      updatedAt: now,
    };

    // For document-type templates without form fields: store the resolved HTML
    if (args.resolvedHtml) {
      try {
        const existing = JSON.parse(doc.responseData as string);
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

    await db.patch("formDocuments", doc._id as string, patch);
    return doc._id as string;
  },
});

// ---------------------------------------------------------------------------
// Resend signing email (authenticated — staff action from appointment view)
// ---------------------------------------------------------------------------

export const resendSigningEmail = action({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const doc = await db.get("formDocuments", args.documentId);
    if (!doc || String(doc.organizationId) !== String(args.organizationId))
      throw new Error("Document not found");
    if (doc.status !== "draft" && doc.status !== "pending_signature")
      throw new Error("Document is not awaiting signature");
    if (!doc.signingToken)
      throw new Error("Document has no signing token");

    // Delegate email sending to side effects (needs Convex db reads for patient lookup)
    try {
      await ctx.runMutation(internal.documents.documents._resendSigningSideEffects, {
        documentId: args.documentId,
        entityType: doc.entityType as string,
        entityId: doc.entityId as string,
      });
    } catch (e) {
      console.error("[documents.resendSigningEmail] Side effects FAILED:", e);
      throw e;
    }

    return { sent: true };
  },
});

export const _resendSigningSideEffects = internalMutation({
  args: {
    documentId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    let recipientEmail: string | undefined;
    let recipientName: string | undefined;

    if (args.entityType === "appointment" && args.entityId) {
      const appointment = await ctx.db.get(args.entityId as any);
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
    } else if (args.entityType === "patient" && args.entityId) {
      const patient = await ctx.db.get(args.entityId as any);
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
        documentId: args.documentId as Id<"formDocuments">,
        recipientEmail,
        recipientName,
      },
    );
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "documents",
        action: "delete",
      },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const doc = await db.get("formDocuments", args.documentId);
    if (!doc || String(doc.organizationId) !== String(args.organizationId)) {
      throw new Error("Document not found");
    }
    if (perm.scope === "own" && String(doc.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    await db.delete("formDocuments", args.documentId);
    return args.documentId;
  },
});

// ---------------------------------------------------------------------------
// Patient-portal query (token-based auth, no org context)
// ---------------------------------------------------------------------------

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
