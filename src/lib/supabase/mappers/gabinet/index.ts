/**
 * Gabinet Entity Mappers — Barrel Export
 *
 * Re-exports all gabinet entity mappers from a single entry point.
 */

export {
  mapGabinetPatientFromSupabase,
  mapGabinetPatientToSupabase,
  type MappedGabinetPatient,
} from "./patients";

export {
  mapGabinetTreatmentFromSupabase,
  mapGabinetTreatmentToSupabase,
  type MappedGabinetTreatment,
} from "./treatments";

export {
  mapGabinetTreatmentVariantFromSupabase,
  mapGabinetTreatmentVariantToSupabase,
  type MappedGabinetTreatmentVariant,
} from "./treatment-variants";

export {
  mapGabinetEmployeeFromSupabase,
  mapGabinetEmployeeToSupabase,
  type MappedGabinetEmployee,
} from "./employees";

export {
  mapGabinetLocationFromSupabase,
  mapGabinetLocationToSupabase,
  type MappedGabinetLocation,
} from "./locations";

export {
  mapGabinetRoomFromSupabase,
  mapGabinetRoomToSupabase,
  type MappedGabinetRoom,
} from "./rooms";

export {
  mapGabinetEquipmentFromSupabase,
  mapGabinetEquipmentToSupabase,
  type MappedGabinetEquipment,
} from "./equipment";

export {
  mapGabinetEquipmentTransferFromSupabase,
  mapGabinetEquipmentTransferToSupabase,
  type MappedGabinetEquipmentTransfer,
} from "./equipment-transfers";

export {
  mapGabinetLeaveTypeFromSupabase,
  mapGabinetLeaveTypeToSupabase,
  type MappedGabinetLeaveType,
} from "./leave-types";

export {
  mapGabinetLeaveBalanceFromSupabase,
  mapGabinetLeaveBalanceToSupabase,
  type MappedGabinetLeaveBalance,
} from "./leave-balances";

export {
  mapGabinetWorkingHoursFromSupabase,
  mapGabinetWorkingHoursToSupabase,
  type MappedGabinetWorkingHours,
} from "./working-hours";

export {
  mapGabinetEmployeeScheduleFromSupabase,
  mapGabinetEmployeeScheduleToSupabase,
  type MappedGabinetEmployeeSchedule,
} from "./employee-schedules";

export {
  mapGabinetAppointmentFromSupabase,
  mapGabinetAppointmentToSupabase,
  type MappedGabinetAppointment,
} from "./appointments";

export {
  mapGabinetLeaveFromSupabase,
  mapGabinetLeaveToSupabase,
  type MappedGabinetLeave,
} from "./leaves";

export {
  mapGabinetOvertimeFromSupabase,
  mapGabinetOvertimeToSupabase,
  type MappedGabinetOvertime,
} from "./overtime";

export {
  mapGabinetTreatmentPackageFromSupabase,
  mapGabinetTreatmentPackageToSupabase,
  type MappedGabinetTreatmentPackage,
  type PackageTreatmentEntry,
} from "./treatment-packages";

export {
  mapGabinetPackageUsageFromSupabase,
  mapGabinetPackageUsageToSupabase,
  type MappedGabinetPackageUsage,
  type PackageTreatmentUsageEntry,
} from "./package-usage";

export {
  mapGabinetLoyaltyPointsFromSupabase,
  mapGabinetLoyaltyPointsToSupabase,
  type MappedGabinetLoyaltyPoints,
} from "./loyalty-points";

export {
  mapGabinetLoyaltyTransactionFromSupabase,
  mapGabinetLoyaltyTransactionToSupabase,
  type MappedGabinetLoyaltyTransaction,
} from "./loyalty-transactions";
