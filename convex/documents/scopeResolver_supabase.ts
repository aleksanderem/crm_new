/**
 * Supabase-backed version of scopeResolver.
 *
 * Used by action-wrapped endpoints (documents.generate.resolveEntityScope,
 * previewDocumentData) that need to fetch entity data for pre-fill. Reads
 * exclusively from Supabase so UUID-based entities work correctly.
 *
 * Covers the same entity types as the original scopeResolver.ts but uses
 * the createSupabaseDb() wrapper instead of ctx.db. Enrichment breadth is
 * intentionally lean — the original was N+1-heavy.
 */

import { createSupabaseDb } from "../_helpers/supabaseDb";
import type { EntityType, ScopeData } from "./scopeResolver";

type SupabaseDb = ReturnType<typeof createSupabaseDb>;

const STRIP_KEYS = new Set([
  "_id",
  "_creationTime",
  "organizationId",
  "createdBy",
  "createdAt",
  "updatedAt",
]);

function flattenEntity(
  entity: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!entity) return {};
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(entity)) {
    if (STRIP_KEYS.has(k)) continue;
    if (
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      k === "address"
    ) {
      for (const [ak, av] of Object.entries(val as Record<string, unknown>)) {
        out[`address.${ak}`] = av;
      }
    } else {
      out[k] = val;
    }
  }
  return out;
}

async function fetchAppointmentScope(
  db: SupabaseDb,
  orgId: string,
  appointmentId: string,
): Promise<ScopeData> {
  const appointment = await db.get("gabinetAppointments", appointmentId);
  if (!appointment || String(appointment.organizationId) !== orgId) return {};

  const scope: ScopeData = {
    appointment: flattenEntity(appointment),
  };

  if (appointment.patientId) {
    const patient = await db.get("gabinetPatients", String(appointment.patientId));
    if (patient) {
      scope.patient = flattenEntity(patient);
      if (patient.contactId) {
        const contact = await db.get("contacts", String(patient.contactId));
        if (contact) scope.contact = flattenEntity(contact);
      }
    }
  }

  if (appointment.treatmentId) {
    const treatment = await db.get("gabinetTreatments", String(appointment.treatmentId));
    if (treatment) {
      scope.treatment = flattenEntity(treatment);
      await resolveTreatmentCategoryName(db, scope.treatment, treatment.categoryId);
    }
  }

  if (appointment.employeeId) {
    const employee = await db
      .query("gabinetEmployees")
      .eq("organizationId", orgId)
      .eq("userId", String(appointment.employeeId))
      .first();
    if (employee) scope.employee = flattenEntity(employee);
  }

  return scope;
}

async function fetchPatientScope(
  db: SupabaseDb,
  orgId: string,
  patientId: string,
): Promise<ScopeData> {
  const patient = await db.get("gabinetPatients", patientId);
  if (!patient || String(patient.organizationId) !== orgId) return {};
  const scope: ScopeData = { patient: flattenEntity(patient) };
  if (patient.contactId) {
    const contact = await db.get("contacts", String(patient.contactId));
    if (contact) scope.contact = flattenEntity(contact);
  }
  return scope;
}

async function fetchEmployeeScope(
  db: SupabaseDb,
  orgId: string,
  employeeId: string,
): Promise<ScopeData> {
  const employee = await db.get("gabinetEmployees", employeeId);
  if (!employee || String(employee.organizationId) !== orgId) return {};
  return { employee: flattenEntity(employee) };
}

async function fetchTreatmentScope(
  db: SupabaseDb,
  orgId: string,
  treatmentId: string,
): Promise<ScopeData> {
  const treatment = await db.get("gabinetTreatments", treatmentId);
  if (!treatment || String(treatment.organizationId) !== orgId) return {};
  const treatmentScope = flattenEntity(treatment);
  await resolveTreatmentCategoryName(db, treatmentScope, treatment.categoryId);
  return { treatment: treatmentScope };
}

/**
 * Resolve `treatment.category` from a structured `categoryId` so document
 * templates using {{treatment.category}} render the linked category name.
 * Falls back to the legacy free-text `category` field already present on the
 * flattened entity when no `categoryId` is set (see #471, #495).
 */
async function resolveTreatmentCategoryName(
  db: SupabaseDb,
  treatmentScope: Record<string, unknown>,
  categoryId: unknown,
): Promise<void> {
  if (!categoryId) return;
  const category = await db.get("categoryDefinitions", String(categoryId));
  if (category && !category.isDeleted) {
    treatmentScope.category = category.name;
  }
}

async function fetchContactScope(
  db: SupabaseDb,
  orgId: string,
  contactId: string,
): Promise<ScopeData> {
  const contact = await db.get("contacts", contactId);
  if (!contact || String(contact.organizationId) !== orgId) return {};
  return { contact: flattenEntity(contact) };
}

async function fetchCompanyScope(
  db: SupabaseDb,
  orgId: string,
  companyId: string,
): Promise<ScopeData> {
  const company = await db.get("companies", companyId);
  if (!company || String(company.organizationId) !== orgId) return {};
  return { company: flattenEntity(company) };
}

async function fetchLeadScope(
  db: SupabaseDb,
  orgId: string,
  leadId: string,
): Promise<ScopeData> {
  const lead = await db.get("leads", leadId);
  if (!lead || String(lead.organizationId) !== orgId) return {};
  const scope: ScopeData = { lead: flattenEntity(lead) };
  if (lead.companyId) {
    const company = await db.get("companies", String(lead.companyId));
    if (company) scope.company = flattenEntity(company);
  }
  return scope;
}

async function addCommonScope(
  db: SupabaseDb,
  orgId: string,
  scope: ScopeData,
): Promise<void> {
  const org = await db.get("organizations", orgId);
  if (org) {
    scope.organization = flattenEntity(org);
  }
  scope.system = {
    today: new Date().toISOString().split("T")[0],
    now: new Date().toISOString(),
    year: new Date().getFullYear(),
  };
}

export async function resolveScopeSupabase(
  db: SupabaseDb,
  orgId: string,
  entityType: EntityType,
  entityId: string,
): Promise<ScopeData> {
  let scope: ScopeData = {};
  switch (entityType) {
    case "appointment":
      scope = await fetchAppointmentScope(db, orgId, entityId);
      break;
    case "patient":
      scope = await fetchPatientScope(db, orgId, entityId);
      break;
    case "employee":
      scope = await fetchEmployeeScope(db, orgId, entityId);
      break;
    case "treatment":
      scope = await fetchTreatmentScope(db, orgId, entityId);
      break;
    case "contact":
      scope = await fetchContactScope(db, orgId, entityId);
      break;
    case "company":
      scope = await fetchCompanyScope(db, orgId, entityId);
      break;
    case "lead":
      scope = await fetchLeadScope(db, orgId, entityId);
      break;
  }
  await addCommonScope(db, orgId, scope);
  return scope;
}
