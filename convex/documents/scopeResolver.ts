import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// ── Types ──────────────────────────────────────────────────────────────────

export type EntityType =
  | "appointment"
  | "patient"
  | "employee"
  | "treatment"
  | "contact"
  | "company"
  | "lead";

/** Flat key-value map produced by scope resolution. */
export type ScopeData = Record<string, Record<string, unknown>>;

/** Variable descriptor exposed to template-builder UI. */
export interface VariableDescriptor {
  path: string; // e.g. "patient.firstName"
  label: string;
  group: string; // e.g. "Patient", "Contact"
}

// ── Internal helpers ───────────────────────────────────────────────────────

const STRIP_KEYS = new Set([
  "_id",
  "_creationTime",
  "organizationId",
  "createdBy",
  "createdAt",
  "updatedAt",
]);

/** Strip internal/system fields from an entity record. */
function flattenEntity(
  entity: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!entity) return {};
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(entity)) {
    if (STRIP_KEYS.has(k)) continue;
    // Flatten nested address objects into dot-notation
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

// ── Fetchers per entity type ───────────────────────────────────────────────

async function fetchAppointment(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  appointmentId: Id<"gabinetAppointments">,
): Promise<ScopeData> {
  const appointment = await ctx.db.get(appointmentId);
  if (!appointment || appointment.organizationId !== orgId) return {};

  const scope: ScopeData = {
    appointment: flattenEntity(
      appointment as unknown as Record<string, unknown>,
    ),
  };

  // Organization
  const org = await ctx.db.get(orgId);
  if (org) {
    scope.organization = flattenEntity(org as unknown as Record<string, unknown>);
  }

  // System fields (date, etc.)
  const now = new Date();
  scope.system = {
    date: now.toISOString().split("T")[0],
    date_pl: now.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }),
    time: now.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }),
    year: String(now.getFullYear()),
  };

  // Patient
  const patient = await ctx.db.get(appointment.patientId);
  if (patient) {
    scope.patient = flattenEntity(
      patient as unknown as Record<string, unknown>,
    );

    // Contact linked to patient
    if (patient.contactId) {
      const contact = await ctx.db.get(patient.contactId);
      if (contact) {
        scope.contact = flattenEntity(
          contact as unknown as Record<string, unknown>,
        );
      }
    }

    // Fallback: if no linked contact, populate contact.* from patient data
    // so templates using contact.firstName etc. still get values
    if (!scope.contact) {
      scope.contact = {
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phone: patient.phone,
      };
    }
  }

  // Treatment
  const treatment = await ctx.db.get(appointment.treatmentId);
  if (treatment) {
    scope.treatment = flattenEntity(
      treatment as unknown as Record<string, unknown>,
    );
  }

  // Employee — employeeId is a users ID; look up gabinetEmployees via by_orgAndUser
  const employeeRecord = await ctx.db
    .query("gabinetEmployees")
    .withIndex("by_orgAndUser", (q) =>
      q.eq("organizationId", orgId).eq("userId", appointment.employeeId),
    )
    .first();
  if (employeeRecord) {
    scope.employee = flattenEntity(
      employeeRecord as unknown as Record<string, unknown>,
    );
  }

  // Also fetch the user record for employee name/email
  const employeeUser = await ctx.db.get(appointment.employeeId);
  if (employeeUser) {
    const userData = flattenEntity(employeeUser as unknown as Record<string, unknown>);
    // Merge user name/email into employee scope (employee record may not have these)
    if (scope.employee) {
      if (!scope.employee.firstName && userData.name) {
        const parts = String(userData.name).split(" ");
        scope.employee.firstName = parts[0] ?? "";
        scope.employee.lastName = parts.slice(1).join(" ") ?? "";
      }
      if (!scope.employee.email) scope.employee.email = userData.email;
    } else {
      const parts = String(userData.name ?? "").split(" ");
      scope.employee = {
        firstName: parts[0] ?? "",
        lastName: parts.slice(1).join(" ") ?? "",
        email: userData.email,
      };
    }
  }

  return scope;
}

async function fetchPatient(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  patientId: Id<"gabinetPatients">,
): Promise<ScopeData> {
  const patient = await ctx.db.get(patientId);
  if (!patient || patient.organizationId !== orgId) return {};

  const scope: ScopeData = {
    patient: flattenEntity(patient as unknown as Record<string, unknown>),
  };

  if (patient.contactId) {
    const contact = await ctx.db.get(patient.contactId);
    if (contact) {
      scope.contact = flattenEntity(
        contact as unknown as Record<string, unknown>,
      );
    }
  }

  return scope;
}

async function fetchEmployee(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  employeeId: Id<"gabinetEmployees">,
): Promise<ScopeData> {
  const employee = await ctx.db.get(employeeId);
  if (!employee || employee.organizationId !== orgId) return {};

  return {
    employee: flattenEntity(employee as unknown as Record<string, unknown>),
  };
}

async function fetchTreatment(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  treatmentId: Id<"gabinetTreatments">,
): Promise<ScopeData> {
  const treatment = await ctx.db.get(treatmentId);
  if (!treatment || treatment.organizationId !== orgId) return {};

  return {
    treatment: flattenEntity(treatment as unknown as Record<string, unknown>),
  };
}

async function fetchContact(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  contactId: Id<"contacts">,
): Promise<ScopeData> {
  const contact = await ctx.db.get(contactId);
  if (!contact || contact.organizationId !== orgId) return {};

  return {
    contact: flattenEntity(contact as unknown as Record<string, unknown>),
  };
}

async function fetchCompany(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  companyId: Id<"companies">,
): Promise<ScopeData> {
  const company = await ctx.db.get(companyId);
  if (!company || company.organizationId !== orgId) return {};

  return {
    company: flattenEntity(company as unknown as Record<string, unknown>),
  };
}

async function fetchLead(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  leadId: Id<"leads">,
): Promise<ScopeData> {
  const lead = await ctx.db.get(leadId);
  if (!lead || lead.organizationId !== orgId) return {};

  const scope: ScopeData = {
    lead: flattenEntity(lead as unknown as Record<string, unknown>),
  };

  // Leads use objectRelationships for contact/company links
  const relationships = await ctx.db
    .query("objectRelationships")
    .withIndex("by_source", (q) =>
      q.eq("sourceType", "lead").eq("sourceId", leadId as string),
    )
    .collect();

  for (const rel of relationships) {
    if (rel.targetType === "contact" && !scope.contact) {
      const contact = await ctx.db.get(rel.targetId as Id<"contacts">);
      if (contact && contact.organizationId === orgId) {
        scope.contact = flattenEntity(
          contact as unknown as Record<string, unknown>,
        );
      }
    }
    if (rel.targetType === "company" && !scope.company) {
      const company = await ctx.db.get(rel.targetId as Id<"companies">);
      if (company && company.organizationId === orgId) {
        scope.company = flattenEntity(
          company as unknown as Record<string, unknown>,
        );
      }
    }
  }

  // Lead also has a direct companyId FK
  if (!scope.company && lead.companyId) {
    const company = await ctx.db.get(lead.companyId);
    if (company && company.organizationId === orgId) {
      scope.company = flattenEntity(
        company as unknown as Record<string, unknown>,
      );
    }
  }

  return scope;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Walk the entity graph from a given root entity and collect all related
 * data into a flat scope map suitable for template variable resolution.
 */
export async function resolveScope(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  entityType: EntityType,
  entityId: string,
): Promise<ScopeData> {
  switch (entityType) {
    case "appointment":
      return fetchAppointment(
        ctx,
        orgId,
        entityId as Id<"gabinetAppointments">,
      );
    case "patient":
      return fetchPatient(ctx, orgId, entityId as Id<"gabinetPatients">);
    case "employee":
      return fetchEmployee(ctx, orgId, entityId as Id<"gabinetEmployees">);
    case "treatment":
      return fetchTreatment(ctx, orgId, entityId as Id<"gabinetTreatments">);
    case "contact":
      return fetchContact(ctx, orgId, entityId as Id<"contacts">);
    case "company":
      return fetchCompany(ctx, orgId, entityId as Id<"companies">);
    case "lead":
      return fetchLead(ctx, orgId, entityId as Id<"leads">);
    default:
      return {};
  }
}

/**
 * Given a bindings map (SurveyJS question name -> entity field path like
 * "patient.firstName") and resolved scope data, produce a flat
 * Record<string, unknown> mapping question names to their values.
 */
export function applyBindings(
  bindings: Record<string, string>,
  scopeData: ScopeData,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [questionName, fieldPath] of Object.entries(bindings)) {
    const dotIndex = fieldPath.indexOf(".");
    if (dotIndex === -1) continue;

    const group = fieldPath.substring(0, dotIndex);
    const field = fieldPath.substring(dotIndex + 1);
    const entityData = scopeData[group];
    if (entityData && field in entityData) {
      result[questionName] = entityData[field];
    }
  }
  return result;
}

// ── Variable catalog ───────────────────────────────────────────────────────

const PATIENT_VARS: VariableDescriptor[] = [
  { path: "patient.firstName", label: "First Name", group: "Patient" },
  { path: "patient.lastName", label: "Last Name", group: "Patient" },
  { path: "patient.email", label: "Email", group: "Patient" },
  { path: "patient.phone", label: "Phone", group: "Patient" },
  { path: "patient.pesel", label: "PESEL", group: "Patient" },
  { path: "patient.dateOfBirth", label: "Date of Birth", group: "Patient" },
  { path: "patient.gender", label: "Gender", group: "Patient" },
  { path: "patient.address.street", label: "Street", group: "Patient" },
  { path: "patient.address.city", label: "City", group: "Patient" },
  {
    path: "patient.address.postalCode",
    label: "Postal Code",
    group: "Patient",
  },
  { path: "patient.medicalNotes", label: "Medical Notes", group: "Patient" },
  { path: "patient.allergies", label: "Allergies", group: "Patient" },
  { path: "patient.bloodType", label: "Blood Type", group: "Patient" },
  {
    path: "patient.emergencyContactName",
    label: "Emergency Contact Name",
    group: "Patient",
  },
  {
    path: "patient.emergencyContactPhone",
    label: "Emergency Contact Phone",
    group: "Patient",
  },
];

const CONTACT_VARS: VariableDescriptor[] = [
  { path: "contact.firstName", label: "First Name", group: "Contact" },
  { path: "contact.lastName", label: "Last Name", group: "Contact" },
  { path: "contact.email", label: "Email", group: "Contact" },
  { path: "contact.phone", label: "Phone", group: "Contact" },
  { path: "contact.title", label: "Title", group: "Contact" },
  { path: "contact.source", label: "Source", group: "Contact" },
];

const COMPANY_VARS: VariableDescriptor[] = [
  { path: "company.name", label: "Company Name", group: "Company" },
  { path: "company.domain", label: "Domain", group: "Company" },
  { path: "company.industry", label: "Industry", group: "Company" },
  { path: "company.size", label: "Size", group: "Company" },
  { path: "company.website", label: "Website", group: "Company" },
  { path: "company.phone", label: "Phone", group: "Company" },
  { path: "company.address.street", label: "Street", group: "Company" },
  { path: "company.address.city", label: "City", group: "Company" },
  { path: "company.address.state", label: "State", group: "Company" },
  { path: "company.address.zip", label: "ZIP", group: "Company" },
  { path: "company.address.country", label: "Country", group: "Company" },
];

const EMPLOYEE_VARS: VariableDescriptor[] = [
  { path: "employee.firstName", label: "First Name", group: "Employee" },
  { path: "employee.lastName", label: "Last Name", group: "Employee" },
  { path: "employee.role", label: "Role", group: "Employee" },
  {
    path: "employee.specialization",
    label: "Specialization",
    group: "Employee",
  },
  {
    path: "employee.licenseNumber",
    label: "License Number",
    group: "Employee",
  },
  { path: "employee.phone", label: "Phone", group: "Employee" },
  { path: "employee.email", label: "Email", group: "Employee" },
  { path: "employee.position", label: "Position", group: "Employee" },
  { path: "employee.department", label: "Department", group: "Employee" },
];

const TREATMENT_VARS: VariableDescriptor[] = [
  { path: "treatment.name", label: "Treatment Name", group: "Treatment" },
  {
    path: "treatment.description",
    label: "Description",
    group: "Treatment",
  },
  { path: "treatment.category", label: "Category", group: "Treatment" },
  { path: "treatment.duration", label: "Duration (min)", group: "Treatment" },
  { path: "treatment.price", label: "Price", group: "Treatment" },
  {
    path: "treatment.contraindications",
    label: "Contraindications",
    group: "Treatment",
  },
  {
    path: "treatment.preparationInstructions",
    label: "Preparation Instructions",
    group: "Treatment",
  },
  {
    path: "treatment.aftercareInstructions",
    label: "Aftercare Instructions",
    group: "Treatment",
  },
];

const ORGANIZATION_VARS: VariableDescriptor[] = [
  { path: "organization.name", label: "Organization Name", group: "Organization" },
  { path: "organization.slug", label: "Slug", group: "Organization" },
];

const SYSTEM_VARS: VariableDescriptor[] = [
  { path: "system.date", label: "Today (ISO)", group: "System" },
  { path: "system.date_pl", label: "Today (Polish)", group: "System" },
  { path: "system.time", label: "Current Time", group: "System" },
  { path: "system.year", label: "Year", group: "System" },
];

const APPOINTMENT_VARS: VariableDescriptor[] = [
  { path: "appointment.date", label: "Date", group: "Appointment" },
  {
    path: "appointment.startTime",
    label: "Start Time",
    group: "Appointment",
  },
  { path: "appointment.endTime", label: "End Time", group: "Appointment" },
  { path: "appointment.status", label: "Status", group: "Appointment" },
  { path: "appointment.notes", label: "Notes", group: "Appointment" },
];

const LEAD_VARS: VariableDescriptor[] = [
  { path: "lead.title", label: "Title", group: "Lead" },
  { path: "lead.value", label: "Value", group: "Lead" },
  { path: "lead.currency", label: "Currency", group: "Lead" },
  { path: "lead.status", label: "Status", group: "Lead" },
  { path: "lead.priority", label: "Priority", group: "Lead" },
  {
    path: "lead.expectedCloseDate",
    label: "Expected Close Date",
    group: "Lead",
  },
  { path: "lead.source", label: "Source", group: "Lead" },
];

/**
 * Return the list of available template variables for a given entity type.
 * Used by the template-builder UI to present a variable picker.
 */
export function getAvailableVariables(
  entityType: EntityType,
): VariableDescriptor[] {
  switch (entityType) {
    case "appointment":
      return [
        ...APPOINTMENT_VARS,
        ...PATIENT_VARS,
        ...TREATMENT_VARS,
        ...EMPLOYEE_VARS,
        ...CONTACT_VARS,
        ...ORGANIZATION_VARS,
        ...SYSTEM_VARS,
      ];
    case "patient":
      return [...PATIENT_VARS, ...CONTACT_VARS];
    case "employee":
      return [...EMPLOYEE_VARS];
    case "treatment":
      return [...TREATMENT_VARS];
    case "contact":
      return [...CONTACT_VARS];
    case "company":
      return [...COMPANY_VARS];
    case "lead":
      return [...LEAD_VARS, ...CONTACT_VARS, ...COMPANY_VARS];
    default:
      return [];
  }
}
