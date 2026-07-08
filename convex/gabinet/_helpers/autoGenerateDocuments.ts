import { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import { createSupabaseDb } from "../../_helpers/supabaseDb";
import { resolveScopeSupabase } from "../../documents/scopeResolver_supabase";

// ---------------------------------------------------------------------------
// Server-safe TipTap JSON helpers (no DOM needed)
// ---------------------------------------------------------------------------

/** Walk TipTap JSON tree and check if any formField nodes exist. */
function hasFormFields(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as { type?: string; content?: unknown[] };
  if (n.type === "formField") return true;
  if (Array.isArray(n.content)) {
    return n.content.some((child) => hasFormFields(child));
  }
  return false;
}

/**
 * Auto-generate formDocuments for an appointment based on its treatment's
 * requiredFormTemplates configuration.
 *
 * Called after an appointment is created. For each required template:
 * 1. Resolves scope data (patient, employee, treatment, appointment, org)
 * 2. Creates a formDocument with pre-filled data
 * 3. If the template requires a signature, schedules a signing email
 *
 * Document-type (TipTap) templates follow a two-step flow when they contain
 * form fields: draft (fill) → pending_signature (sign). Templates without
 * form fields go directly to pending_signature.
 */
export async function autoGenerateAppointmentDocuments(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    appointmentId: Id<"gabinetAppointments">;
    treatmentId: Id<"gabinetTreatments">;
    patientId: Id<"gabinetPatients">;
    createdBy: Id<"users">;
    /** When set, only generate documents matching this timing. */
    timing?: "before_start" | "during_visit" | "after_completion";
    /** When true, skip sending signing emails (employee fills first). */
    deferEmails?: boolean;
  },
): Promise<Id<"formDocuments">[]> {
  // gabinet entities live in Supabase with UUID IDs that Convex ctx.db
  // can't decode. Read treatment/templates/patient and scope data via the
  // Supabase wrapper. Same fix pattern as #1105/#1112 — see issue #1113.
  const supabaseDb = createSupabaseDb();
  const treatment = await supabaseDb.get(
    "gabinetTreatments",
    String(args.treatmentId),
  );
  if (!treatment) return [];

  let requiredTemplates = (treatment.requiredFormTemplates as
    | Array<{
        templateId: string;
        timing?: "before_start" | "during_visit" | "after_completion";
        isOneTime?: boolean;
      }>
    | undefined) ?? [];
  if (requiredTemplates.length === 0) return [];

  // Filter by timing if requested
  if (args.timing) {
    requiredTemplates = requiredTemplates.filter(
      (t) => t.timing === args.timing,
    );
    if (requiredTemplates.length === 0) return [];
  }

  // Resolve scope data once for all templates (appointment context)
  const scopeData = await resolveScopeSupabase(
    supabaseDb,
    String(args.organizationId),
    "appointment",
    args.appointmentId as string,
  );

  // Flatten scope to dot-notation for responseData pre-fill
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

  const now = Date.now();
  const createdDocIds: Id<"formDocuments">[] = [];

  for (const entry of requiredTemplates) {
    try {
      // Skip if this is a one-time document and the patient has already signed it.
      // Uses a two-step query: fetch the patient's appointment IDs (indexed on
      // organization_id, patient_id), then check form_documents by entity_id IN
      // (those IDs). This avoids the previous O(N-org) scan + in-memory JSON parse
      // that was needed because scope_entities is TEXT, not JSONB.
      if (entry.isOneTime) {
        const patientAppointments = await supabaseDb
          .query("gabinetAppointments")
          .eq("patientId", String(args.patientId))
          .eq("organizationId", String(args.organizationId))
          .collect();
        if (patientAppointments.length > 0) {
          const appointmentIds = patientAppointments.map((a) => String(a._id));
          const alreadySigned = await supabaseDb
            .query("formDocuments")
            .eq("templateId", String(entry.templateId))
            .eq("organizationId", String(args.organizationId))
            .eq("entityType", "appointment")
            .eq("status", "signed")
            .in("entityId", appointmentIds)
            .first();
          if (alreadySigned) continue;
        }
      }

      // Skip if a document for this template+appointment already exists
      const existing = await supabaseDb
        .query("formDocuments")
        .eq("templateId", String(entry.templateId))
        .eq("entityType", "appointment")
        .eq("entityId", args.appointmentId as string)
        .first();
      if (existing) {
        createdDocIds.push(
          (existing as Record<string, unknown>)._id as Id<"formDocuments">,
        );
        continue;
      }

      const template = await supabaseDb.get(
        "formTemplates",
        String(entry.templateId),
      );
      if (!template || !template.isActive) continue;

      // --- Determine initial status ---
      // For document-type (TipTap) templates with form fields, start as "draft"
      // so the patient fills the form first, then signs.
      const contentJson = template.contentJson as string | null | undefined;
      const isDocumentType =
        template.templateType === "document" && !!contentJson;
      const documentHasFormFields =
        isDocumentType && hasFormFields(JSON.parse(contentJson!));

      let status: "draft" | "pending_signature";
      if (args.deferEmails) {
        // When deferring emails (after_completion flow), always start as "draft"
        // so the employee dialog can process the document and trigger the email.
        status = "draft";
      } else if (isDocumentType && documentHasFormFields) {
        // Two-step: patient fills form fields → then signs
        status = "draft";
      } else if (template.requiresSignature) {
        status = "pending_signature";
      } else {
        status = "draft";
      }

      // Generate signing token for any document that requires signature
      // (including draft document-type templates — patient accesses via token to fill + sign)
      let signingToken: string | undefined;
      let signingTokenExpiresAt: number | undefined;
      if (template.requiresSignature) {
        signingToken = crypto.randomUUID();
        signingTokenExpiresAt = now + 48 * 60 * 60 * 1000; // 48 hours
      }

      const insertPayload = {
        organizationId: String(args.organizationId),
        templateId: String(entry.templateId),
        title: template.name,
        responseData: JSON.stringify(prefilledData),
        entityType: "appointment",
        entityId: args.appointmentId as string,
        scopeEntities: {
          patient: args.patientId,
          treatment: args.treatmentId,
        },
        status,
        timing: entry.timing ?? null,
        autoGenerated: true,
        signingToken: signingToken ?? null,
        signingTokenExpiresAt: signingTokenExpiresAt ?? null,
        createdBy: String(args.createdBy),
        createdAt: now,
        updatedAt: now,
      };

      // Defensive guard for pre-migration-00018 environments: the initial
      // form_documents CHECK constraint only allows 'before_start' and
      // 'after_completion'. Inserting 'during_visit' raises a constraint
      // violation which would propagate up and abort _createSideEffects
      // (killing activity log, reminders, etc.). If the first insert fails,
      // retry with timing: null so the document is still created.
      let docId: string;
      try {
        docId = await supabaseDb.insert("formDocuments", insertPayload);
      } catch (_timingErr) {
        console.warn(
          `[autoGenerateDocuments] Insert failed for template ${entry.templateId} ` +
            `(timing='${entry.timing ?? null}'); retrying with timing=null. ` +
            "If this recurs, run migration 00018.",
        );
        docId = await supabaseDb.insert("formDocuments", {
          ...insertPayload,
          timing: null,
        });
      }

      createdDocIds.push(docId as Id<"formDocuments">);

      // Send signing email to patient if document requires signature
      // (skip when deferEmails is set — employee fills first, email sent after)
      if (template.requiresSignature && signingToken && !args.deferEmails) {
        const patient = await supabaseDb.get(
          "gabinetPatients",
          String(args.patientId),
        );
        if (patient?.email) {
          const patientName = `${patient.firstName}${patient.lastName ? " " + patient.lastName : ""}`;
          await ctx.scheduler.runAfter(
            0,
            internal.documents.signing.sendSigningEmailInternal,
            {
              documentId: docId as Id<"formDocuments">,
              recipientEmail: patient.email,
              recipientName: patientName,
            },
          );
        } else {
          // The signing action never runs (no recipient), so log the skip
          // here via the scheduler so operators see the entry in
          // /settings/mail → Logs. ctx.scheduler avoids the TS2589 depth
          // blow-up that direct ctx.db.insert against the new table causes
          // in this mutation.
          await ctx.scheduler.runAfter(0, internal.emailSendLog.record, {
            organizationId: args.organizationId,
            source: "auto_generate",
            status: "skipped",
            errorMessage: "Patient has no email address on file",
            recipientEmail: "",
            subject: `Signing email for "${template.name}"`,
            relatedEntityType: "formDocument",
            relatedEntityId: docId as string,
            triggeredBy: args.createdBy,
          });
        }
      }
    } catch (err) {
      console.warn(
        `[autoGenerateDocuments] Failed to generate document for template ${entry.templateId}:`,
        err,
      );
    }
  }

  return createdDocIds;
}
