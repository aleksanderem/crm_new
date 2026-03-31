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
