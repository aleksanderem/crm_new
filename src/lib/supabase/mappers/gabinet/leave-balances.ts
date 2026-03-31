/**
 * Gabinet Leave Balances Mapper — Supabase ↔ Frontend
 */

import type { GabinetLeaveBalanceRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetLeaveBalance {
  _id: string;
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

export const mapGabinetLeaveBalanceFromSupabase = mapper.mapFromSupabase;
export const mapGabinetLeaveBalanceToSupabase = mapper.mapToSupabase;
