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

// Scope resolution now happens via Supabase — see scopeResolver_supabase.ts.
// The previous ctx.db.get-based implementation was removed in #1113 because
// gabinet entities (patient/appointment/treatment/etc.) live in Supabase
// with UUID IDs that Convex ctx.db can't decode.

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
