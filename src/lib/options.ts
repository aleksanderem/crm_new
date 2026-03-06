/**
 * Shared option dictionaries for selects, filters, and inline editing.
 * Values derived from convex/schema.ts validators.
 * Labels use i18n keys — call the helper with `t` to get translated options.
 */

// --- Raw value arrays (single source of truth, matching schema validators) ---

export const LEAD_STATUSES = ["open", "won", "lost", "archived"] as const;
export const LEAD_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const DOCUMENT_CATEGORIES = ["proposal", "contract", "invoice", "presentation", "report", "other"] as const;
export const DOCUMENT_STATUSES = ["draft", "sent", "accepted", "lost"] as const;

export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;

export const GENDERS = ["male", "female", "other"] as const;

export const EMPLOYEE_ROLES = ["doctor", "nurse", "therapist", "receptionist", "admin", "other"] as const;

export const APPOINTMENT_STATUSES = ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"] as const;

export const GABINET_DOC_TYPES = ["consent", "medical_record", "prescription", "referral", "custom"] as const;
export const GABINET_DOC_STATUSES = ["draft", "pending_signature", "signed", "archived"] as const;

export const CALL_OUTCOMES = ["busy", "leftVoiceMessage", "movedConversationForward", "wrongNumber", "noAnswer"] as const;

export const LOYALTY_TIERS = ["bronze", "silver", "gold", "platinum"] as const;

// --- Typed option builders ---

type SelectOption = { label: string; value: string };
type TFn = (key: string) => string;

function buildOptions(values: readonly string[], t: TFn, keyPrefix: string): SelectOption[] {
  return values.map((v) => ({ label: t(`${keyPrefix}.${v}`), value: v }));
}

// --- Public helpers (pass `t` from useTranslation) ---

export const leadStatusOptions = (t: TFn): SelectOption[] =>
  buildOptions(LEAD_STATUSES, t, "deals.filters");

export const leadPriorityOptions = (t: TFn): SelectOption[] =>
  buildOptions(LEAD_PRIORITIES, t, "deals.priority");

export const documentCategoryOptions = (t: TFn): SelectOption[] =>
  buildOptions(DOCUMENT_CATEGORIES, t, "documents.category");

export const documentStatusOptions = (t: TFn): SelectOption[] =>
  buildOptions(DOCUMENT_STATUSES, t, "documents.status");

export const companySizeOptions = (): SelectOption[] =>
  COMPANY_SIZES.map((v) => ({ label: v, value: v }));

export const genderOptions = (t: TFn): SelectOption[] =>
  buildOptions(GENDERS, t, "gabinet.patients.genderOptions");

export const employeeRoleOptions = (t: TFn): SelectOption[] =>
  buildOptions(EMPLOYEE_ROLES, t, "gabinet.employees.roles");

export const appointmentStatusOptions = (t: TFn): SelectOption[] =>
  buildOptions(APPOINTMENT_STATUSES, t, "gabinet.appointments.statuses");

export const gabinetDocTypeOptions = (t: TFn): SelectOption[] =>
  buildOptions(GABINET_DOC_TYPES, t, "gabinet.documents.types");

export const gabinetDocStatusOptions = (t: TFn): SelectOption[] =>
  buildOptions(GABINET_DOC_STATUSES, t, "gabinet.documents.statuses");

export const callOutcomeOptions = (t: TFn): SelectOption[] =>
  buildOptions(CALL_OUTCOMES, t, "calls.outcomes");
