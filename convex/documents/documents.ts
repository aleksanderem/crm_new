import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { validatePortalSessionSupabase } from "../_helpers/portalSession";
import { formDocumentStatusValidator } from "../schema/documents";
import { resolveComponentsInContent } from "./resolveComponents";
import type { FormDocumentRow, FormTemplateRow } from "../_helpers/supabaseRows";
import { Id } from "../_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for document writes

export const listAll = action({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(formDocumentStatusValidator),
  },
  handler: async (ctx, args): Promise<FormDocumentRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    let q = db
      .query("formDocuments")
      .eq("organizationId", String(args.organizationId));
    if (args.status) {
      q = q.eq("status", args.status);
    }
    return (await q
      .order("createdAt", false)
      .collect()) as FormDocumentRow[];
  },
});

export const listByEntity = action({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args): Promise<FormDocumentRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    const docs = (await db
      .query("formDocuments")
      .eq("organizationId", String(args.organizationId))
      .eq("entityType", args.entityType)
      .eq("entityId", args.entityId)
      .collect()) as FormDocumentRow[];
    // Stable order: sortOrder asc (rows without one sink to the bottom),
    // then createdAt asc as a tiebreaker. The frontend renders this order
    // 1:1 so drag-and-drop reordering persists across reloads.
    return docs.sort((a, b) => {
      const ao = a.sortOrder ?? Number.POSITIVE_INFINITY;
      const bo = b.sortOrder ?? Number.POSITIVE_INFINITY;
      if (ao !== bo) return ao - bo;
      return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });
  },
});

// Reorder documents within an (entityType, entityId) scope.
// `documentIds` must contain the full set of documents for that scope, in the
// desired display order. Writes are scoped to the caller's organization.
export const reorderByEntity = action({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
    documentIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const now = Date.now();

    for (let i = 0; i < args.documentIds.length; i++) {
      const docId = args.documentIds[i];
      const doc = await db.get("formDocuments", docId);
      if (
        !doc ||
        String(doc.organizationId) !== String(args.organizationId) ||
        doc.entityType !== args.entityType ||
        doc.entityId !== args.entityId
      ) {
        throw new Error("Document not found");
      }
      await db.patch("formDocuments", docId, {
        sortOrder: i,
        updatedAt: now,
      });
    }
  },
});

export const getById = action({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.string(),
  },
  handler: async (ctx, args): Promise<FormDocumentRow> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    const doc = await db.get("formDocuments", args.documentId);
    if (!doc || String(doc.organizationId) !== String(args.organizationId))
      throw new Error("Document not found");
    return doc as FormDocumentRow;
  },
});

// Get document by signing token (no auth required -- public signing page).
// Reads from Supabase since `formDocuments`, `formTemplates`, and
// `documentComponents` are all Supabase-primary now.
export const getBySigningToken = action({
  args: { token: v.string() },
  handler: async (_ctx, args): Promise<{
    document: FormDocumentRow;
    template: FormTemplateRow | null;
  }> => {
    const db = createSupabaseDb();

    const doc = await db
      .query("formDocuments")
      .eq("signingToken", args.token)
      .first();
    if (!doc) throw new Error("Document not found");
    if (doc.signingTokenExpiresAt && doc.signingTokenExpiresAt < Date.now())
      throw new Error("Signing link expired");
    // Return document data for any active status — the frontend decides
    // what to render based on status (fill form, sign, or show success).

    // Also fetch template for rendering, with components resolved
    const template = await db.get("formTemplates", String(doc.templateId));
    if (template?.contentJson) {
      const resolved = await resolveComponentsInContent(
        db,
        template.contentJson,
      );
      return {
        document: doc,
        template: { ...template, contentJson: resolved },
      };
    }
    return { document: doc, template };
  },
});

export const listByTemplate = action({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("formTemplates"),
  },
  handler: async (ctx, args): Promise<FormDocumentRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    return (await db
      .query("formDocuments")
      .eq("organizationId", String(args.organizationId))
      .eq("templateId", String(args.templateId))
      .collect()) as FormDocumentRow[];
  },
});

export const listByStatus = action({
  args: {
    organizationId: v.id("organizations"),
    status: formDocumentStatusValidator,
  },
  handler: async (ctx, args): Promise<FormDocumentRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    return (await db
      .query("formDocuments")
      .eq("organizationId", String(args.organizationId))
      .eq("status", args.status)
      .collect()) as FormDocumentRow[];
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
  handler: async (_ctx, args) => {
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

    // Send signing email to patient — resolve recipient via Supabase
    // (entity IDs are Supabase UUIDs, not Convex IDs, so ctx.db.get won't work)
    if (doc.signingToken) {
      let recipientEmail: string | undefined;
      let recipientName: string | undefined;
      const entityType = doc.entityType as string | undefined;
      const entityId = doc.entityId as string | undefined;

      if (entityType === "appointment" && entityId) {
        const appointment = await db.get("gabinetAppointments", entityId);
        if (appointment && typeof appointment === "object") {
          const appt = appointment as { patientId?: string };
          if (appt.patientId) {
            const patient = await db.get("gabinetPatients", String(appt.patientId));
            if (patient && typeof patient === "object") {
              const p = patient as { email?: string; firstName?: string; lastName?: string };
              recipientEmail = p.email;
              recipientName = [p.firstName, p.lastName].filter(Boolean).join(" ") || undefined;
            }
          }
        }
      } else if (entityType === "patient" && entityId) {
        const patient = await db.get("gabinetPatients", entityId);
        if (patient && typeof patient === "object") {
          const p = patient as { email?: string; firstName?: string; lastName?: string };
          recipientEmail = p.email;
          recipientName = [p.firstName, p.lastName].filter(Boolean).join(" ") || undefined;
        }
      }

      if (recipientEmail) {
        await ctx.scheduler.runAfter(
          0,
          internal.documents.signing.sendSigningEmailInternal,
          {
            documentId: args.documentId as Id<"formDocuments">,
            recipientEmail,
            recipientName,
          },
        );
      }
    }

    return args.documentId;
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
  handler: async (_ctx, args) => {
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

    let recipientEmail: string | undefined;
    let recipientName: string | undefined;
    const entityType = doc.entityType as string | undefined;
    const entityId = doc.entityId as string | undefined;

    if (entityType === "appointment" && entityId) {
      const appointment = await db.get("gabinetAppointments", entityId);
      if (appointment && typeof appointment === "object") {
        const appt = appointment as { patientId?: string };
        if (appt.patientId) {
          const patient = await db.get("gabinetPatients", String(appt.patientId));
          if (patient && typeof patient === "object") {
            const p = patient as { email?: string; firstName?: string; lastName?: string };
            recipientEmail = p.email;
            recipientName = [p.firstName, p.lastName].filter(Boolean).join(" ") || undefined;
          }
        }
      }
    } else if (entityType === "patient" && entityId) {
      const patient = await db.get("gabinetPatients", entityId);
      if (patient && typeof patient === "object") {
        const p = patient as { email?: string; firstName?: string; lastName?: string };
        recipientEmail = p.email;
        recipientName = [p.firstName, p.lastName].filter(Boolean).join(" ") || undefined;
      }
    }

    if (!recipientEmail) {
      throw new Error("Nie znaleziono adresu e-mail pacjenta");
    }

    // Call the send action directly (not via scheduler) so failures
    // propagate back to the UI instead of being silently swallowed.
    await ctx.runAction(internal.documents.signing.sendSigningEmailInternal, {
      documentId: args.documentId as Id<"formDocuments">,
      recipientEmail,
      recipientName,
    });

    return { sent: true };
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
// Patient-portal read (token-based auth, no org context). Reads from
// Supabase: `gabinetPortalSessions`, `gabinetAppointments`, `formDocuments`
// and `formTemplates` are all Supabase-only since the dual-write cleanup.
// ---------------------------------------------------------------------------

export const listByPatientToken = action({
  args: { tokenHash: v.string() },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    const { patientId, organizationId } = await validatePortalSessionSupabase(
      db,
      args.tokenHash,
    );

    // 1. Documents linked directly to the patient
    const patientDocs = await db
      .query("formDocuments")
      .eq("entityType", "patient")
      .eq("entityId", patientId)
      .collect();

    // 2. Documents linked to the patient's appointments
    const appointments = await db
      .query("gabinetAppointments")
      .eq("organizationId", organizationId)
      .eq("patientId", patientId)
      .collect();

    const appointmentDocArrays = await Promise.all(
      appointments.map((appt) =>
        db
          .query("formDocuments")
          .eq("entityType", "appointment")
          .eq("entityId", String(appt._id))
          .collect(),
      ),
    );

    // Merge & deduplicate
    const allDocs = [...patientDocs, ...appointmentDocArrays.flat()];
    const seen = new Set<string>();
    const unique = allDocs.filter((d) => {
      if (String(d.organizationId) !== organizationId) return false;
      const id = String(d._id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // Batch-fetch templates to avoid N+1 reads.
    const templateIds = Array.from(
      new Set(
        unique
          .map((d) => d.templateId)
          .filter((id): id is NonNullable<typeof id> => typeof id === "string" && id.length > 0),
      ),
    );
    const templates = await db.getMany("formTemplates", templateIds);
    const templateById = new Map<string, Record<string, unknown>>();
    for (const t of templates) {
      templateById.set(String(t._id), t);
    }

    const enriched = unique.map((doc) => {
      const template = templateById.get(String(doc.templateId));
      return {
        _id: String(doc._id),
        title: doc.title as string,
        status: doc.status as string,
        entityType: doc.entityType as string,
        entityId: doc.entityId as string,
        responseData: doc.responseData as string,
        signatureData: (doc.signatureData as string | null) ?? undefined,
        signedAt: (doc.signedAt as number | null) ?? undefined,
        signingToken: (doc.signingToken as string | null) ?? undefined,
        createdAt: doc.createdAt as number,
        updatedAt: doc.updatedAt as number,
        templateName: (template?.name as string | undefined) ?? "",
        category: (template?.category as string | undefined) ?? "custom",
        formJson: (template?.formJson as string | undefined) ?? "{}",
        requiresSignature:
          (template?.requiresSignature as boolean | undefined) ?? false,
      };
    });

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ---------------------------------------------------------------------------
// Helper: recursively extract formField nodes from a TipTap JSON tree.
// ---------------------------------------------------------------------------

type ExtractedFormFieldDef = {
  fieldId: string;
  fieldType: string;
  label: string;
  options: string;
  required: boolean;
  filledBy: string;
};

function walkTipTapForFields(
  node: unknown,
  out: ExtractedFormFieldDef[],
): void {
  if (!node || typeof node !== "object") return;
  const n = node as {
    type?: string;
    attrs?: Record<string, unknown>;
    content?: unknown[];
  };
  if (n.type === "formField" && n.attrs) {
    out.push({
      fieldId: String(n.attrs.fieldId ?? ""),
      fieldType: String(n.attrs.fieldType ?? "text"),
      label: String(n.attrs.label ?? ""),
      options: String(n.attrs.options ?? ""),
      required: Boolean(n.attrs.required),
      filledBy: String(n.attrs.filledBy ?? "client"),
    });
  }
  if (Array.isArray(n.content)) {
    for (const child of n.content) walkTipTapForFields(child, out);
  }
}

// ---------------------------------------------------------------------------
// getLatestSignedIntakeByPatient — returns formFieldValues from the most
// recent signed/completed form directly linked to a patient, enriched
// with field definitions extracted from the template's TipTap contentJson.
// No template-category filter is applied: the template category="intake" is
// the intended convention but the UI defaults new templates to category="custom",
// so restricting to intake-category would silently return null for most orgs.
// ---------------------------------------------------------------------------

export const getLatestSignedIntakeByPatient = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    documentId: string;
    templateId: string;
    templateName: string;
    signedAt: number | null;
    formFieldValues: Record<string, string>;
    fieldDefinitions: ExtractedFormFieldDef[];
    byFieldType: Record<
      string,
      Array<{ fieldId: string; label: string; value: string }>
    >;
  } | null> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const orgId = String(args.organizationId);

    // 1. Fetch formDocuments directly linked to this patient (entity_type='patient')
    const patientDocs = await db
      .query("formDocuments")
      .eq("organizationId", orgId)
      .eq("entityType", "patient")
      .eq("entityId", args.patientId)
      .collect();

    // 2. Fetch appointment-linked docs for this org and filter by patient in scopeEntities.
    // Documents generated from the appointment checklist use entityType='appointment'
    // and store the linked patient id in scopeEntities.patient (set by generateDocument
    // and autoGenerateAppointmentDocuments). Both TEXT and JSONB formats are handled.
    const apptDocs = await db
      .query("formDocuments")
      .eq("organizationId", orgId)
      .eq("entityType", "appointment")
      .collect();

    const apptPatientDocs = apptDocs.filter((doc) => {
      if (!doc.scopeEntities) return false;
      try {
        const scope =
          typeof doc.scopeEntities === "string"
            ? (JSON.parse(doc.scopeEntities as string) as Record<string, unknown>)
            : (doc.scopeEntities as Record<string, unknown>);
        return String(scope?.patient) === args.patientId;
      } catch {
        return false;
      }
    });

    // 3. Filter combined set to signed/completed status (any template category)
    const signedDocs = [...patientDocs, ...apptPatientDocs].filter(
      (doc) => doc.status === "signed" || doc.status === "completed",
    );

    if (signedDocs.length === 0) return null;

    // 4. Pick most recent (signedAt desc, fallback to updatedAt)
    signedDocs.sort((a, b) => {
      const aTime = (a.signedAt as number | null) ?? (a.updatedAt as number);
      const bTime = (b.signedAt as number | null) ?? (b.updatedAt as number);
      return bTime - aTime;
    });
    const doc = signedDocs[0];

    // 5. Fetch the template for this document (single lookup, no category restriction)
    const template = doc.templateId
      ? await db.get("formTemplates", String(doc.templateId))
      : null;

    // 6. Parse formFieldValues from responseData
    const formFieldValues: Record<string, string> = {};
    try {
      const responseData = JSON.parse(doc.responseData as string);
      const raw = responseData.formFieldValues;
      if (raw && typeof raw === "object") {
        for (const [k, val] of Object.entries(raw as Record<string, unknown>)) {
          formFieldValues[k] = String(val);
        }
      }
    } catch {
      // malformed responseData — return empty map
    }

    // 7. Extract field definitions from template's TipTap contentJson
    const fieldDefinitions: ExtractedFormFieldDef[] = [];
    if (template?.contentJson) {
      try {
        walkTipTapForFields(
          JSON.parse(template.contentJson as string),
          fieldDefinitions,
        );
      } catch {
        // malformed contentJson — skip enrichment
      }
    }

    // 8. Group values by fieldType
    const byFieldType: Record<
      string,
      Array<{ fieldId: string; label: string; value: string }>
    > = {};
    for (const field of fieldDefinitions) {
      const value = formFieldValues[field.fieldId] ?? "";
      if (!byFieldType[field.fieldType]) byFieldType[field.fieldType] = [];
      byFieldType[field.fieldType].push({
        fieldId: field.fieldId,
        label: field.label,
        value,
      });
    }

    return {
      documentId: String(doc._id),
      templateId: String(doc.templateId),
      templateName: (template?.name as string) ?? "",
      signedAt: (doc.signedAt as number | null) ?? null,
      formFieldValues,
      fieldDefinitions,
      byFieldType,
    };
  },
});
