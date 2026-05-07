/**
 * Gabinet Leave Balances Mapper — Supabase ↔ Frontend
 */

import type { GabinetLeaveBalanceRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetLeaveBalance {
  _id: string;
  _creationTime: number;
  organizationId: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  totalDays: number;
  usedDays: number;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<
  GabinetLeaveBalanceRow,
  MappedGabinetLeaveBalance
>({});

export const mapGabinetLeaveBalanceFromSupabase = (
  row: GabinetLeaveBalanceRow,
): MappedGabinetLeaveBalance => {
  const mapped = mapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapGabinetLeaveBalanceToSupabase = mapper.mapToSupabase;
