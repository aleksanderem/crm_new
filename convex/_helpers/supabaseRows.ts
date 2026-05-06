import type { Doc, TableNames } from "../_generated/dataModel";

// Row shape returned by `createSupabaseDb()` queries — mirrors the Convex
// `Doc<T>` minus `_creationTime`, which is not preserved when round-tripping
// through Postgres. Optional fields may surface as `null` rather than
// `undefined`; consumers that read those fields should coalesce with `??`.
export type SupabaseRow<T extends TableNames> = Omit<Doc<T>, "_creationTime">;

export type FormDocumentRow = SupabaseRow<"formDocuments">;
export type FormTemplateRow = SupabaseRow<"formTemplates">;
export type GabinetTreatmentRow = SupabaseRow<"gabinetTreatments">;
export type GabinetPatientRow = SupabaseRow<"gabinetPatients">;
export type GabinetAppointmentRow = SupabaseRow<"gabinetAppointments">;
export type GabinetEmployeeRow = SupabaseRow<"gabinetEmployees">;

// Envelope returned by Supabase-backed list actions that imitate the Convex
// pagination contract. The cursor is unused (Supabase-backed lists return
// everything in one page), but kept for API-shape compatibility.
export interface SupabasePaginationResult<TRow> {
  page: TRow[];
  isDone: boolean;
  continueCursor: string;
}
