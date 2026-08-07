import type { Doc, TableNames } from "../_generated/dataModel";

// Row shape returned by `createSupabaseDb()` queries — mirrors the Convex
// `Doc<T>` minus `_creationTime`, which is not preserved when round-tripping
// through Postgres. Optional fields may surface as `null` rather than
// `undefined`; consumers that read those fields should coalesce with `??`.
export type SupabaseRow<T extends TableNames> = Omit<Doc<T>, "_creationTime">;

export type DocumentAnalysisJobRow = SupabaseRow<"documentAnalysisJobs">;
export type FormDocumentRow = SupabaseRow<"formDocuments">;
export type FormTemplateRow = SupabaseRow<"formTemplates">;
export type GabinetTreatmentRow = SupabaseRow<"gabinetTreatments">;
export type GabinetTreatmentProductRow = SupabaseRow<"gabinetTreatmentProducts">;
export type GabinetPatientRow = SupabaseRow<"gabinetPatients">;
export type GabinetAppointmentRow = SupabaseRow<"gabinetAppointments">;
export type GabinetEmployeeRow = SupabaseRow<"gabinetEmployees">;
export type GabinetEmployeeLocationRow = SupabaseRow<"gabinetEmployeeLocations">;
export type GabinetEmployeeScheduleRow = SupabaseRow<"gabinetEmployeeSchedules">;
export type GabinetWorkingHoursRow = SupabaseRow<"gabinetWorkingHours">;
export type GabinetLeaveRow = SupabaseRow<"gabinetLeaves">;
export type GabinetLeaveTypeRow = SupabaseRow<"gabinetLeaveTypes">;
export type GabinetOvertimeRow = SupabaseRow<"gabinetOvertime">;
export type GabinetPaymentMethodRow = SupabaseRow<"gabinetPaymentMethods">;
export type GabinetLocationRow = SupabaseRow<"gabinetLocations">;
export type GabinetRoomRow = SupabaseRow<"gabinetRooms">;
export type GabinetEquipmentRow = SupabaseRow<"gabinetEquipment">;
export type GabinetTreatmentPackageRow = SupabaseRow<"gabinetTreatmentPackages">;
export type GabinetPackageUsageRow = SupabaseRow<"gabinetPackageUsage">;
export type GabinetLoyaltyTransactionRow = SupabaseRow<"gabinetLoyaltyTransactions">;
export type GabinetLoyaltyTierRow = SupabaseRow<"gabinetLoyaltyTiers">;
export type GabinetCashTransactionRow = SupabaseRow<"gabinetCashTransactions">;
export type GabinetDayCloseRow = SupabaseRow<"gabinetDayCloses">;
export type AppointmentWorkflowHistoryRow = SupabaseRow<"appointmentWorkflowHistory">;
export type PaymentRow = SupabaseRow<"payments">;
export type NoteRow = SupabaseRow<"notes">;
export type EmailRow = SupabaseRow<"emails">;
export type WarehouseDeliveryRow = SupabaseRow<"warehouseDeliveries">;
export type WarehouseDeliveryItemRow = SupabaseRow<"warehouseDeliveryItems">;

// Envelope returned by Supabase-backed list actions that imitate the Convex
// pagination contract. The cursor encodes the next page offset as a decimal
// string; isDone=true and continueCursor="" signal the last page.
export interface SupabasePaginationResult<TRow> {
  page: TRow[];
  isDone: boolean;
  continueCursor: string;
}
