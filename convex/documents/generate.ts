import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { EntityType, ScopeData } from "./scopeResolver";
import { resolveScopeSupabase } from "./scopeResolver_supabase";
import { resolveComponentsInContent } from "./resolveComponents";
import { Id } from "../_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for document writes

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Resolve entity scope data for the frontend before rendering the form.
 */
export const resolveEntityScope = action({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args): Promise<ScopeData> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    return await resolveScopeSupabase(
      db,
      String(args.organizationId),
      args.entityType as EntityType,
      args.entityId,
    );
  },
});

/**
 * Preview pre-filled data for a specific template + entity combination.
 */
export const previewDocumentData = action({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args): Promise<{
    prefilledData: Record<string, string>;
    scopeData: ScopeData;
    templateType: "document";
    contentJson: string;
  }> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const template = await db.get("formTemplates", args.templateId);
    if (!template || String(template.organizationId) !== String(args.organizationId))
      throw new Error("Template not found");

    const scopeData = await resolveScopeSupabase(
      db,
      String(args.organizationId),
      args.entityType as EntityType,
      args.entityId,
    );

    const prefilledData: Record<string, string> = {};
    for (const [entityType, fields] of Object.entries(scopeData)) {
      if (typeof fields !== "object" || fields === null) continue;
      for (const [key, value] of Object.entries(
        fields as Record<string, unknown>,
      )) {
        if (value !== null && value !== undefined) {
          prefilledData[`${entityType}.${key}`] = String(value);
        }
      }
    }

    // Resolve componentBlock nodes so the editor JSON returned here already
    // has each component's actual content inlined. Without this, the client
    // calls generateHTML over `componentBlock` nodes whose renderHTML emits
    // the literal placeholder "[Komponent: <id>]" — that placeholder then
    // gets baked into responseData.html and into every generated document
    // (#1915).
    const resolvedContentJson =
      (await resolveComponentsInContent(db, template.contentJson as string)) ?? "";

    return {
      prefilledData,
      scopeData,
      templateType: ((template.templateType as string) ?? "document") as "document",
      contentJson: resolvedContentJson,
    };
  },
});

// ── Actions (Supabase-primary) ─────────────────────────────────────────────

export const generateDocument = action({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    responseData: v.string(),
    title: v.optional(v.string()),
    hasClientFields: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    // Read template from Supabase
    const db = createSupabaseDb();
    const template = await db.get("formTemplates", args.templateId);
    if (!template || String(template.organizationId) !== String(args.organizationId))
      throw new Error("Template not found");

    const now = Date.now();
    const title = args.title ?? (template.name as string);

    const hasClient = args.hasClientFields === true;

    let status: "draft" | "pending_signature" | "completed";
    if (hasClient) {
      status = "draft";
    } else if (template.requiresSignature) {
      status = "pending_signature";
    } else {
      status = "completed";
    }

    // Generate signing token if client needs to interact
    let signingToken: string | undefined;
    let signingTokenExpiresAt: number | undefined;
    if (hasClient || template.requiresSignature) {
      signingToken = crypto.randomUUID();
      signingTokenExpiresAt = now + 48 * 60 * 60 * 1000;
    }

    // When generating a document for an appointment, populate scopeEntities so
    // getLatestSignedIntakeByPatient can find this document via the JSONB
    // containment query (scope_entities @> {"patient": "<id>"}). Without this,
    // manually-generated appointment documents are invisible to the patient card
    // intake summary — only auto-generated ones (which set scopeEntities in
    // autoGenerateDocuments.ts) were previously being found.
    let scopeEntities: Record<string, string> | null = null;
    if (args.entityType === "appointment") {
      const appointment = await db.get("gabinetAppointments", args.entityId);
      if (appointment?.patientId) {
        scopeEntities = { patient: String(appointment.patientId) };
      }
    }

    const docId = await db.insert("formDocuments", {
      organizationId: String(args.organizationId),
      templateId: args.templateId,
      title,
      responseData: args.responseData,
      entityType: args.entityType,
      entityId: args.entityId,
      scopeEntities,
      status,
      signingToken: signingToken ?? null,
      signingTokenExpiresAt: signingTokenExpiresAt ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    // Send signing/filling email via side effects.
    // _generateSideEffects is now an internalAction (was internalMutation) —
    // postgrest-js setTimeout-based retry would crash in mutation context.
    if (signingToken) {
      try {
        await ctx.runAction(internal.documents.generate._generateSideEffects, {
          documentId: docId,
          organizationId: args.organizationId,
          entityType: args.entityType,
          entityId: args.entityId,
        });
      } catch (e) {
        console.error("[generate.generateDocument] Side effects FAILED:", e);
      }
    }

    return { documentId: docId, status, signingToken };
  },
});

/**
 * Fetch form field values from the most recent completed questionnaire
 * for the same template + patient. Returns null when no prior response
 * exists so callers can skip prefilling entirely.
 */
export const getPriorResponseData = action({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ formFieldValues: Record<string, string> } | null> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();

    // Resolve the patient id from the entity context
    let patientId: string | null = null;
    if (args.entityType === "patient") {
      patientId = args.entityId;
    } else if (args.entityType === "appointment") {
      const appt = await db.get("gabinetAppointments", args.entityId);
      if (appt && String(appt.organizationId) === String(args.organizationId)) {
        patientId = appt.patientId ? String(appt.patientId) : null;
      }
    }

    if (!patientId) return null;

    // All signed/completed docs for this template in this org
    const allDocs = await db
      .query("formDocuments")
      .eq("organizationId", String(args.organizationId))
      .eq("templateId", args.templateId)
      .collect();

    const resolvedPatientId = patientId;
    const patientDocs = allDocs.filter((doc) => {
      if (doc.status !== "signed" && doc.status !== "completed") return false;
      // Direct patient-entity link
      if (
        doc.entityType === "patient" &&
        String(doc.entityId) === resolvedPatientId
      )
        return true;
      // Appointment-linked doc with scopeEntities.patient
      if (doc.scopeEntities) {
        const scope = doc.scopeEntities as unknown as Record<string, unknown>;
        return String(scope?.patient) === resolvedPatientId;
      }
      return false;
    });

    if (patientDocs.length === 0) return null;

    // Most recent first
    patientDocs.sort(
      (a, b) => (b.createdAt as number) - (a.createdAt as number),
    );
    const mostRecent = patientDocs[0];

    try {
      const responseData = JSON.parse(mostRecent.responseData as string);
      const rawValues = responseData.formFieldValues;
      if (
        !rawValues ||
        typeof rawValues !== "object" ||
        Object.keys(rawValues).length === 0
      ) {
        return null;
      }
      const formFieldValues: Record<string, string> = {};
      for (const [k, v] of Object.entries(
        rawValues as Record<string, unknown>,
      )) {
        formFieldValues[k] = String(v);
      }
      return { formFieldValues };
    } catch {
      return null;
    }
  },
});

// Converted from internalMutation → internalAction so it can survive
// transient Supabase retries. postgrest-js retries failed fetches via
// `executeWithRetry → sleep → setTimeout`, which the Convex mutation runtime
// rejects. The body only does Supabase reads and a scheduler.runAfter call —
// both legal in actions, neither needs the determinism guarantees a
// mutation provides.
export const _generateSideEffects = internalAction({
  args: {
    documentId: v.string(),
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    // Scope entities (patient/appointment/etc.) live in Supabase with UUID
    // IDs that the Convex ctx.db can't decode. Resolve via the Supabase
    // wrapper instead — same pattern the parent action uses.
    const db = createSupabaseDb();
    const scopeData = await resolveScopeSupabase(
      db,
      String(args.organizationId),
      args.entityType as EntityType,
      args.entityId,
    );

    const patientData = scopeData.patient as Record<string, unknown> | undefined;
    const contactData = scopeData.contact as Record<string, unknown> | undefined;
    const signerEmail =
      (patientData?.email as string | undefined) ??
      (contactData?.email as string | undefined);
    const signerName =
      (patientData?.firstName as string | undefined) ??
      (contactData?.firstName as string | undefined);

    if (signerEmail) {
      await ctx.scheduler.runAfter(
        0,
        internal.documents.signing.sendSigningEmailInternal,
        {
          documentId: args.documentId as Id<"formDocuments">,
          recipientEmail: signerEmail,
          recipientName: signerName,
        },
      );
    }
  },
});
