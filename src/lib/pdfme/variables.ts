// ---------------------------------------------------------------------------
// PDFme Variable Registry
//
// Frontend-usable registry of available template variables organized by entity
// type. Field names in PDFme templates ARE the variable paths (e.g.
// "patient.firstName"), eliminating the need for a separate binding step.
// ---------------------------------------------------------------------------

export interface VariableField {
  /** Dot-notation path used as the PDFme field name, e.g. "patient.firstName" */
  path: string;
  /** Polish display label */
  label: string;
  /** English display label */
  labelEn: string;
  /** Grouping category, e.g. "patient", "contact" */
  category: string;
}

// ---------------------------------------------------------------------------
// Variable definitions per entity category
// ---------------------------------------------------------------------------

export const VARIABLE_REGISTRY: Record<string, VariableField[]> = {
  common: [
    { path: "organization.name", label: "Nazwa organizacji", labelEn: "Organization name", category: "organization" },
    { path: "system.today", label: "Dzisiejsza data", labelEn: "Today's date", category: "system" },
    { path: "system.date_pl", label: "Data (format PL)", labelEn: "Date (PL format)", category: "system" },
  ],
  contact: [
    { path: "contact.firstName", label: "Imię kontaktu", labelEn: "Contact first name", category: "contact" },
    { path: "contact.lastName", label: "Nazwisko kontaktu", labelEn: "Contact last name", category: "contact" },
    { path: "contact.email", label: "Email kontaktu", labelEn: "Contact email", category: "contact" },
    { path: "contact.phone", label: "Telefon kontaktu", labelEn: "Contact phone", category: "contact" },
    { path: "contact.title", label: "Stanowisko kontaktu", labelEn: "Contact title", category: "contact" },
    { path: "contact.source", label: "Źródło kontaktu", labelEn: "Contact source", category: "contact" },
  ],
  company: [
    { path: "company.name", label: "Nazwa firmy", labelEn: "Company name", category: "company" },
    { path: "company.domain", label: "Domena firmy", labelEn: "Company domain", category: "company" },
    { path: "company.industry", label: "Branża firmy", labelEn: "Company industry", category: "company" },
    { path: "company.website", label: "Strona www firmy", labelEn: "Company website", category: "company" },
    { path: "company.phone", label: "Telefon firmy", labelEn: "Company phone", category: "company" },
    { path: "company.address.street", label: "Ulica firmy", labelEn: "Company street", category: "company" },
    { path: "company.address.city", label: "Miasto firmy", labelEn: "Company city", category: "company" },
    { path: "company.address.zip", label: "Kod pocztowy firmy", labelEn: "Company ZIP", category: "company" },
    { path: "company.address.country", label: "Kraj firmy", labelEn: "Company country", category: "company" },
  ],
  patient: [
    { path: "patient.firstName", label: "Imię pacjenta", labelEn: "Patient first name", category: "patient" },
    { path: "patient.lastName", label: "Nazwisko pacjenta", labelEn: "Patient last name", category: "patient" },
    { path: "patient.email", label: "Email pacjenta", labelEn: "Patient email", category: "patient" },
    { path: "patient.phone", label: "Telefon pacjenta", labelEn: "Patient phone", category: "patient" },
    { path: "patient.pesel", label: "PESEL pacjenta", labelEn: "Patient PESEL", category: "patient" },
    { path: "patient.dateOfBirth", label: "Data urodzenia", labelEn: "Date of birth", category: "patient" },
    { path: "patient.gender", label: "Płeć", labelEn: "Gender", category: "patient" },
    { path: "patient.bloodType", label: "Grupa krwi", labelEn: "Blood type", category: "patient" },
    { path: "patient.allergies", label: "Alergie", labelEn: "Allergies", category: "patient" },
    { path: "patient.medicalNotes", label: "Notatki medyczne", labelEn: "Medical notes", category: "patient" },
    { path: "patient.address.street", label: "Ulica pacjenta", labelEn: "Patient street", category: "patient" },
    { path: "patient.address.city", label: "Miasto pacjenta", labelEn: "Patient city", category: "patient" },
    { path: "patient.address.postalCode", label: "Kod pocztowy pacjenta", labelEn: "Patient postal code", category: "patient" },
    { path: "patient.emergencyContactName", label: "Kontakt awaryjny — imię", labelEn: "Emergency contact name", category: "patient" },
    { path: "patient.emergencyContactPhone", label: "Kontakt awaryjny — telefon", labelEn: "Emergency contact phone", category: "patient" },
  ],
  employee: [
    { path: "employee.firstName", label: "Imię pracownika", labelEn: "Employee first name", category: "employee" },
    { path: "employee.lastName", label: "Nazwisko pracownika", labelEn: "Employee last name", category: "employee" },
    { path: "employee.role", label: "Rola pracownika", labelEn: "Employee role", category: "employee" },
    { path: "employee.specialization", label: "Specjalizacja", labelEn: "Specialization", category: "employee" },
    { path: "employee.licenseNumber", label: "Numer licencji", labelEn: "License number", category: "employee" },
    { path: "employee.phone", label: "Telefon pracownika", labelEn: "Employee phone", category: "employee" },
    { path: "employee.email", label: "Email pracownika", labelEn: "Employee email", category: "employee" },
    { path: "employee.position", label: "Stanowisko", labelEn: "Position", category: "employee" },
    { path: "employee.department", label: "Dział", labelEn: "Department", category: "employee" },
  ],
  treatment: [
    { path: "treatment.name", label: "Nazwa zabiegu", labelEn: "Treatment name", category: "treatment" },
    { path: "treatment.description", label: "Opis zabiegu", labelEn: "Treatment description", category: "treatment" },
    { path: "treatment.category", label: "Kategoria zabiegu", labelEn: "Treatment category", category: "treatment" },
    { path: "treatment.duration", label: "Czas zabiegu (min)", labelEn: "Treatment duration (min)", category: "treatment" },
    { path: "treatment.price", label: "Cena zabiegu", labelEn: "Treatment price", category: "treatment" },
    { path: "treatment.contraindications", label: "Przeciwwskazania", labelEn: "Contraindications", category: "treatment" },
    { path: "treatment.preparationInstructions", label: "Instrukcje przygotowania", labelEn: "Preparation instructions", category: "treatment" },
    { path: "treatment.aftercareInstructions", label: "Zalecenia pozabiegowe", labelEn: "Aftercare instructions", category: "treatment" },
  ],
  appointment: [
    { path: "appointment.date", label: "Data wizyty", labelEn: "Appointment date", category: "appointment" },
    { path: "appointment.startTime", label: "Godzina rozpoczęcia", labelEn: "Start time", category: "appointment" },
    { path: "appointment.endTime", label: "Godzina zakończenia", labelEn: "End time", category: "appointment" },
    { path: "appointment.status", label: "Status wizyty", labelEn: "Appointment status", category: "appointment" },
    { path: "appointment.notes", label: "Notatki wizyty", labelEn: "Appointment notes", category: "appointment" },
  ],
  lead: [
    { path: "lead.title", label: "Tytuł leada", labelEn: "Lead title", category: "lead" },
    { path: "lead.value", label: "Wartość leada", labelEn: "Lead value", category: "lead" },
    { path: "lead.currency", label: "Waluta", labelEn: "Currency", category: "lead" },
    { path: "lead.status", label: "Status leada", labelEn: "Lead status", category: "lead" },
    { path: "lead.priority", label: "Priorytet", labelEn: "Priority", category: "lead" },
    { path: "lead.expectedCloseDate", label: "Planowana data zamknięcia", labelEn: "Expected close date", category: "lead" },
    { path: "lead.source", label: "Źródło leada", labelEn: "Lead source", category: "lead" },
  ],
};

// ---------------------------------------------------------------------------
// Category display labels (Polish + English)
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS: Record<string, { pl: string; en: string }> = {
  organization: { pl: "Organizacja", en: "Organization" },
  system: { pl: "System", en: "System" },
  contact: { pl: "Kontakt", en: "Contact" },
  company: { pl: "Firma", en: "Company" },
  patient: { pl: "Pacjent", en: "Patient" },
  employee: { pl: "Pracownik", en: "Employee" },
  treatment: { pl: "Zabieg", en: "Treatment" },
  appointment: { pl: "Wizyta", en: "Appointment" },
  lead: { pl: "Lead", en: "Lead" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get variables relevant for given entity types. Always includes common
 * variables (organization, system). Entity type relationships are respected:
 * - appointment includes patient, employee, treatment, contact
 * - patient includes contact
 * - lead includes contact, company
 */
export function getVariablesForEntityTypes(entityTypes: string[]): VariableField[] {
  const vars: VariableField[] = [...VARIABLE_REGISTRY.common];

  for (const et of entityTypes) {
    if (VARIABLE_REGISTRY[et]) {
      vars.push(...VARIABLE_REGISTRY[et]);
    }
    // Appointment includes patient, employee, treatment, contact
    if (et === "appointment") {
      vars.push(...(VARIABLE_REGISTRY.patient ?? []));
      vars.push(...(VARIABLE_REGISTRY.employee ?? []));
      vars.push(...(VARIABLE_REGISTRY.treatment ?? []));
      vars.push(...(VARIABLE_REGISTRY.contact ?? []));
    }
    // Patient includes contact
    if (et === "patient") {
      vars.push(...(VARIABLE_REGISTRY.contact ?? []));
    }
    // Lead includes contact, company
    if (et === "lead") {
      vars.push(...(VARIABLE_REGISTRY.contact ?? []));
      vars.push(...(VARIABLE_REGISTRY.company ?? []));
    }
  }

  // Deduplicate by path
  const seen = new Set<string>();
  return vars.filter((v) => {
    if (seen.has(v.path)) return false;
    seen.add(v.path);
    return true;
  });
}

/**
 * Group a flat list of variables by their category for display.
 */
export function groupVariablesByCategory(
  variables: VariableField[],
): Record<string, VariableField[]> {
  const groups: Record<string, VariableField[]> = {};
  for (const v of variables) {
    if (!groups[v.category]) groups[v.category] = [];
    groups[v.category].push(v);
  }
  return groups;
}

/**
 * Flatten nested scope data (from resolveScope) to dot-notation keys
 * for direct use as PDFme inputs. Field names in the template ARE the
 * variable paths, so this flat map can be passed directly to PDFme.
 *
 * Input:  { patient: { firstName: "Jan", lastName: "Kowalski" }, organization: { name: "Klinika" } }
 * Output: { "patient.firstName": "Jan", "patient.lastName": "Kowalski", "organization.name": "Klinika" }
 */
export function flattenScopeData(
  scopeData: Record<string, Record<string, unknown>>,
): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [entityType, fields] of Object.entries(scopeData)) {
    if (typeof fields !== "object" || fields === null) continue;
    for (const [key, value] of Object.entries(fields)) {
      if (value !== null && value !== undefined) {
        flat[`${entityType}.${key}`] = String(value);
      }
    }
  }
  return flat;
}
