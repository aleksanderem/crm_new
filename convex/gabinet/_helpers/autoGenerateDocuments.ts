import { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import { createSupabaseDb } from "../../_helpers/supabaseDb";
import { resolveScopeSupabase } from "../../documents/scopeResolver_supabase";
import { resolveComponentsInContent } from "../../documents/resolveComponents";

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
    createdBy: string;
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
        isRequired?: boolean;
        frequency?: "once" | "first_visit_only" | "before_each_visit" | "every_n_days" | "on_expiry";
        validityDays?: number;
        isOneTime?: boolean;
      }>
    | undefined) ?? [];

  // Fetch org-level required templates and merge them in.
  // Org-required templates apply to every appointment regardless of treatment,
  // are always one-time for the patient, and default to "before_start" timing.
  const orgRequiredRows = await supabaseDb
    .query("formTemplates")
    .eq("organizationId", String(args.organizationId))
    .eq("isOrgRequired", true)
    .eq("isActive", true)
    .collect();

  if (orgRequiredRows.length > 0) {
    // templateIds already covered by the treatment list — no duplicates
    const treatmentTemplateIds = new Set(requiredTemplates.map((t) => t.templateId));
    for (const row of orgRequiredRows) {
      const id = String(row._id);
      if (!treatmentTemplateIds.has(id)) {
        requiredTemplates = [
          ...requiredTemplates,
          { templateId: id, timing: "before_start", frequency: "once", isOneTime: true },
        ];
      }
    }
  }

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
      // Derive effective frequency from the entry, falling back to legacy isOneTime.
      const effectiveFrequency = entry.frequency ?? (entry.isOneTime ? "once" : "before_each_visit");

      // Frequency-based skip logic.
      if (effectiveFrequency === "once") {
        // Skip if the patient has already signed this template for any appointment.
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
            .in("status", ["signed", "completed"])
            .in("entityId", appointmentIds)
            .first();
          if (alreadySigned) continue;
        }
      } else if (effectiveFrequency === "first_visit_only") {
        // Skip if the patient already has any completed/signed appointment for
        // this treatment (i.e. this is not their first visit).
        const priorAppointments = await supabaseDb
          .query("gabinetAppointments")
          .eq("patientId", String(args.patientId))
          .eq("organizationId", String(args.organizationId))
          .eq("treatmentId", String(args.treatmentId))
          .in("status", ["completed"])
          .collect();
        // Exclude the current appointment from the count.
        const priorCount = priorAppointments.filter(
          (a) => String(a._id) !== String(args.appointmentId),
        ).length;
        if (priorCount > 0) continue;
      } else if (effectiveFrequency === "every_n_days" || effectiveFrequency === "on_expiry") {
        // Skip if the patient has a signed copy that is still valid (not expired).
        const validityMs = (entry.validityDays ?? 0) * 24 * 60 * 60 * 1000;
        if (validityMs > 0) {
          const patientAppointments = await supabaseDb
            .query("gabinetAppointments")
            .eq("patientId", String(args.patientId))
            .eq("organizationId", String(args.organizationId))
            .collect();
          if (patientAppointments.length > 0) {
            const appointmentIds = patientAppointments.map((a) => String(a._id));
            const recentlySigned = await supabaseDb
              .query("formDocuments")
              .eq("templateId", String(entry.templateId))
              .eq("organizationId", String(args.organizationId))
              .eq("entityType", "appointment")
              .in("status", ["signed", "completed"])
              .in("entityId", appointmentIds)
              .first();
            if (recentlySigned) {
              // Check via expiresAt (set after migration 00142) or fallback to
              // signedAt + validityMs for documents created before the migration.
              const expiresAt = (recentlySigned as Record<string, unknown>).expiresAt as number | null | undefined;
              const signedAt = (recentlySigned as Record<string, unknown>).signedAt as number | null | undefined;
              const effectiveExpiry = expiresAt ?? (signedAt != null ? signedAt + validityMs : null);
              if (effectiveExpiry != null && effectiveExpiry > now) continue;
            }
          }
        }
      }
      // effectiveFrequency === "before_each_visit": never skip — fall through

      // Skip if a document for this template+appointment already exists
      const existing = await supabaseDb
        .query("formDocuments")
        .eq("templateId", String(entry.templateId))
        .eq("entityType", "appointment")
        .eq("entityId", args.appointmentId as string)
        .first();
      if (existing) {
        // When the appointment is re-completed after a data change (date/time/
        // employee/treatment), the draft document's responseData may contain
        // stale values from the first completion. Refresh it now so the
        // employee sees current appointment data when they open the form.
        // Only draft documents are patched — signed, completed, voided, and
        // expired documents are left unchanged.
        if ((existing as Record<string, unknown>).status === "draft") {
          await supabaseDb.patch(
            "formDocuments",
            String((existing as Record<string, unknown>)._id),
            { responseData: JSON.stringify(prefilledData), updatedAt: Date.now() },
          );
        }
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

      // Resolve componentBlock nodes now so future component edits never
      // affect the stored snapshot for this document.
      const resolvedContentJson = contentJson
        ? (await resolveComponentsInContent(supabaseDb, contentJson)) ?? null
        : null;

      // Fetch the patient before determining status — we need their email to
      // decide whether we can create a deliverable pending_signature document.
      const patient = await supabaseDb.get(
        "gabinetPatients",
        String(args.patientId),
      );
      const patientEmail = patient?.email as string | undefined;
      const patientName = patient
        ? `${patient.firstName as string}${patient.lastName ? " " + (patient.lastName as string) : ""}`
        : undefined;

      let status: "draft" | "pending_signature";
      if (args.deferEmails) {
        // When deferring emails (after_completion flow), always start as "draft"
        // so the employee dialog can process the document and trigger the email.
        status = "draft";
      } else if (isDocumentType && documentHasFormFields) {
        // Two-step: patient fills form fields → then signs
        status = "draft";
      } else if (template.requiresSignature) {
        // Without an email address we cannot deliver the signing link. Keep the
        // document as draft so it stays visible without expiring and staff can
        // resend once the patient's email is on file.
        status = patientEmail ? "pending_signature" : "draft";
      } else {
        status = "draft";
      }

      // Generate signing token for any document that requires signature
      // (including draft document-type templates — patient accesses via token to fill + sign).
      // When the patient has no email, omit the expiry timestamp so the hourly
      // expiry job does not mark this document as expired before the patient can
      // be reached via an alternative channel and staff can resend.
      let signingToken: string | undefined;
      let signingTokenExpiresAt: number | undefined;
      if (template.requiresSignature) {
        const tokenBytes = new Uint8Array(32);
        crypto.getRandomValues(tokenBytes);
        signingToken = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");
        if (patientEmail && entry.timing !== "during_visit") {
          signingTokenExpiresAt = now + 48 * 60 * 60 * 1000; // 48 hours
        }
        // No expiry when there is no email, or when timing is during_visit (visit may be
        // days away) — expiry starts when the first signing email is actually sent.
      }

      // Snapshot validityDays from the rule so later config changes never
      // retroactively alter the validity of already-issued documents (D27).
      const documentValidityDays = (
        effectiveFrequency === "every_n_days" || effectiveFrequency === "on_expiry"
      ) ? (entry.validityDays ?? null) : null;

      const insertPayload = {
        organizationId: String(args.organizationId),
        templateId: String(entry.templateId),
        templateVersion: (template.version as number | null | undefined) ?? null,
        contentJsonSnapshot: resolvedContentJson,
        title: template.name,
        responseData: JSON.stringify(prefilledData),
        entityType: "appointment",
        entityId: args.appointmentId as string,
        scopeEntities: {
          patient: args.patientId,
          treatment: args.treatmentId,
        },
        generatedForTreatmentId: args.treatmentId as string,
        status,
        timing: entry.timing ?? null,
        autoGenerated: true,
        isRequired: entry.isRequired ?? true,
        documentValidityDays: documentValidityDays ?? null,
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
      // NOTE: documents stored with timing=null are invisible to checkDocumentGate,
      // which filters by timing. A persistent log entry is written so operators
      // can see the degradation in /settings/mail → Logs and know to run migration 00018.
      let docId: string;
      try {
        docId = await supabaseDb.insert("formDocuments", insertPayload);
      } catch (_timingErr) {
        // Persist a failure log entry so operators see this in /settings/mail → Logs.
        // console.warn alone is transient and invisible to staff.
        await ctx.scheduler.runAfter(0, internal.emailSendLog.record, {
          organizationId: args.organizationId,
          source: "auto_generate",
          status: "failed",
          errorMessage:
            `[migration-00018-missing] timing='${entry.timing ?? null}' constraint violation ` +
            "inserting formDocument — retried with timing=null. This document is now " +
            "invisible to the document gate (checkDocumentGate filters by timing). " +
            "Run migration 00018 to restore correct gate behaviour.",
          recipientEmail: "",
          subject: `[autoGenerateDocuments] timing fallback — template ${entry.templateId}`,
          relatedEntityType: "gabinetAppointment",
          relatedEntityId: args.appointmentId as string,
          triggeredBy: args.createdBy,
        });
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
        if (patientEmail) {
          await ctx.scheduler.runAfter(
            0,
            internal.documents.signing.sendSigningEmailInternal,
            {
              documentId: docId as Id<"formDocuments">,
              recipientEmail: patientEmail,
              recipientName: patientName,
            },
          );
        } else {
          // No email address — document was created as draft (not pending_signature)
          // and the signing token has no expiry. Log the skip so operators see it in
          // /settings/mail → Logs. Staff can resend once the patient's email is added.
          // ctx.scheduler avoids the TS2589 depth blow-up that direct ctx.db.insert
          // against the new table causes in this mutation.
          await ctx.scheduler.runAfter(0, internal.emailSendLog.record, {
            organizationId: args.organizationId,
            source: "auto_generate",
            status: "skipped",
            errorMessage:
              "Patient has no email address — document created as draft, token preserved for future delivery",
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
