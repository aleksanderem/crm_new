/**
 * Catalog of built-in gabinet_patients fields a document-template field may map
 * to. The `target` value (after the "builtin:" prefix) MUST stay in sync with
 * the ALLOWED_BUILTIN allowlist in convex/documents/_helpers/patientBindings.ts.
 */

export interface PatientBuiltinField {
  /** camelCase column key (or "address.<sub>") — the write-back target. */
  key: string;
  label: string;
}

export const PATIENT_BUILTIN_FIELDS: PatientBuiltinField[] = [
  { key: "pesel", label: "PESEL" },
  { key: "dateOfBirth", label: "Data urodzenia" },
  { key: "phone", label: "Telefon" },
  { key: "email", label: "E-mail" },
  { key: "allergies", label: "Alergie" },
  { key: "bloodType", label: "Grupa krwi" },
  { key: "emergencyContactName", label: "Kontakt alarmowy – imię" },
  { key: "emergencyContactPhone", label: "Kontakt alarmowy – telefon" },
  { key: "medicalNotes", label: "Notatki medyczne" },
  { key: "referralSource", label: "Źródło polecenia" },
  { key: "address.street", label: "Adres – ulica" },
  { key: "address.city", label: "Adres – miasto" },
  { key: "address.postalCode", label: "Adres – kod pocztowy" },
];

/** Map an editor form-field type to a custom-field definition type. */
export function formFieldTypeToCustomFieldType(fieldType: string): string {
  switch (fieldType) {
    case "select":
    case "button_select":
      return "select";
    case "date":
      return "date";
    case "checkbox":
      return "checkbox";
    case "textarea":
    case "text":
    default:
      return "text";
  }
}

/** Slugify a human label into a stable, reusable custom-field key. */
export function slugifyFieldKey(label: string): string {
  const map: Record<string, string> = {
    ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
  };
  return label
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => map[c] ?? c)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "pole";
}
