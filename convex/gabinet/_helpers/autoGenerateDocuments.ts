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
    timing?: "before_start" | "after_completion";
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
    | Array<{ templateId: string; timing?: "before_start" | "after_completion" }>
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

    const docId = await supabaseDb.insert("formDocuments", {
      organizationId: String(args.organizationId),
      templateId: String(entry.templateId),
      title: template.name,
      responseData: JSON.stringify(prefilledData),
      entityType: "appointment",
      entityId: args.appointmentId as string,
      scopeEntities: JSON.stringify({
        patient: args.patientId,
        treatment: args.treatmentId,
      }),
      status,
      timing: entry.timing,
      autoGenerated: true,
      signingToken: signingToken ?? null,
      signingTokenExpiresAt: signingTokenExpiresAt ?? null,
      createdBy: String(args.createdBy),
      createdAt: now,
      updatedAt: now,
    });

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
      }
    }
  }

  return createdDocIds;
}
