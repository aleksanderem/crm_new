import type { createSupabaseDb } from "../../_helpers/supabaseDb";

type Db = ReturnType<typeof createSupabaseDb>;

/**
 * Write-back of client-filled form-document values into the patient record
 * (gabinet_patients), driven by the template's `variableBindings` map.
 *
 * Binding target formats (stored per fieldId in formTemplates.variableBindings):
 *   - "builtin:<column>"  — a whitelisted gabinet_patients column (camelCase),
 *                           e.g. "builtin:pesel", "builtin:address.city"
 *   - "custom:<fieldKey>" — a customFieldDefinitions row (entityType gabinetPatient)
 *
 * Policy (product decisions 2026-07-09):
 *   - fill-if-empty: never overwrite a value the patient already has
 *   - runs only when a document reaches a signed/completed state
 *
 * Best-effort: callers wrap this so a write-back failure never breaks signing.
 */

// Whitelisted TEXT columns on gabinet_patients that a template field may target.
// camelCase keys are what supabaseDb.patch expects (it maps to snake_case).
// Nested address subfields are handled via the "address." prefix.
const ALLOWED_BUILTIN = new Set<string>([
  "pesel",
  "dateOfBirth",
  "phone",
  "email",
  "allergies",
  "bloodType",
  "emergencyContactName",
  "emergencyContactPhone",
  "medicalNotes",
  "referralSource",
  "address.street",
  "address.city",
  "address.postalCode",
]);

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
}

async function resolvePatientId(
  db: Db,
  orgIdStr: string,
  doc: Record<string, unknown>,
): Promise<string | null> {
  // Prefer the explicit scope link.
  // scope_entities is JSONB since migration 00044 — Supabase returns an object,
  // not a string. Handle both to stay compatible with any legacy string paths.
  if (doc.scopeEntities) {
    try {
      const scope = (
        typeof doc.scopeEntities === "string"
          ? JSON.parse(doc.scopeEntities)
          : doc.scopeEntities
      ) as Record<string, unknown>;
      if (scope.patient) return String(scope.patient);
    } catch {
      // ignore malformed scope
    }
  }
  const entityType = doc.entityType as string | undefined;
  const entityId = doc.entityId as string | undefined;
  if (!entityId) return null;
  if (entityType === "gabinetPatient" || entityType === "patient") {
    return entityId;
  }
  if (entityType === "appointment") {
    const appointment = await db.get("gabinetAppointments", entityId);
    if (appointment && String(appointment.organizationId) === orgIdStr) {
      return String(appointment.patientId);
    }
  }
  return null;
}

export async function applyPatientBindings(
  db: Db,
  orgIdStr: string,
  doc: Record<string, unknown>,
): Promise<void> {
  const templateId = doc.templateId;
  if (!templateId) return;

  const template = await db.get("formTemplates", String(templateId));
  if (!template || typeof template.variableBindings !== "string") return;

  let bindings: Record<string, unknown>;
  try {
    bindings = JSON.parse(template.variableBindings) as Record<string, unknown>;
  } catch {
    return;
  }
  const entries = Object.entries(bindings).filter(
    ([, target]) => typeof target === "string" && target,
  ) as Array<[string, string]>;
  if (entries.length === 0) return;

  // Client-entered values live under responseData.formFieldValues, keyed by fieldId.
  let fieldValues: Record<string, unknown> = {};
  try {
    const rd = JSON.parse(String(doc.responseData ?? "{}")) as Record<string, unknown>;
    fieldValues = (rd.formFieldValues as Record<string, unknown>) ?? {};
  } catch {
    return;
  }

  const patientId = await resolvePatientId(db, orgIdStr, doc);
  if (!patientId) return;
  const patient = await db.get("gabinetPatients", patientId);
  if (!patient || String(patient.organizationId) !== orgIdStr) return;

  // ---- Built-in columns (fill-if-empty) ----
  const builtinUpdate: Record<string, unknown> = {};
  const customTargets: Array<{ fieldKey: string; value: unknown }> = [];

  for (const [fieldId, target] of entries) {
    const raw = fieldValues[fieldId];
    if (isEmpty(raw)) continue;

    if (target.startsWith("builtin:")) {
      const col = target.slice("builtin:".length);
      if (!ALLOWED_BUILTIN.has(col)) continue;
      if (col.startsWith("address.")) {
        const addrField = col.slice("address.".length);
        const currentAddr =
          (patient.address as Record<string, unknown> | undefined) ?? {};
        if (!isEmpty(currentAddr[addrField])) continue;
        const merged =
          (builtinUpdate.address as Record<string, unknown> | undefined) ?? {
            ...currentAddr,
          };
        merged[addrField] = raw;
        builtinUpdate.address = merged;
      } else {
        if (!isEmpty((patient as Record<string, unknown>)[col])) continue;
        builtinUpdate[col] = raw;
      }
    } else if (target.startsWith("custom:")) {
      customTargets.push({ fieldKey: target.slice("custom:".length), value: raw });
    }
  }

  if (Object.keys(builtinUpdate).length > 0) {
    await db.patch("gabinetPatients", patientId, builtinUpdate);
  }

  // ---- Custom fields (fill-if-empty) ----
  if (customTargets.length > 0) {
    const defs = await db
      .query("customFieldDefinitions")
      .eq("organizationId", orgIdStr)
      .eq("entityType", "gabinetPatient")
      .collect();
    const defByKey = new Map(defs.map((d) => [d.fieldKey as string, d]));

    const existingVals = await db
      .query("customFieldValues")
      .eq("organizationId", orgIdStr)
      .eq("entityType", "gabinetPatient")
      .eq("entityId", patientId)
      .collect();
    const valByDef = new Map(
      existingVals.map((v) => [String(v.fieldDefinitionId), v]),
    );

    const now = Date.now();
    for (const { fieldKey, value } of customTargets) {
      const def = defByKey.get(fieldKey);
      if (!def) continue; // dangling binding — definition was deleted
      const existing = valByDef.get(String(def._id));
      if (existing) {
        if (isEmpty(existing.value)) {
          await db.patch("customFieldValues", existing._id as string, {
            value,
            updatedAt: now,
          });
        }
      } else {
        await db.insert("customFieldValues", {
          organizationId: orgIdStr,
          fieldDefinitionId: String(def._id),
          entityType: "gabinetPatient",
          entityId: patientId,
          value,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }
}
