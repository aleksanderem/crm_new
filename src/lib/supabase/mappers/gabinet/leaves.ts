/**
 * Gabinet Leaves Mapper — Supabase ↔ Frontend
 */

import type { GabinetLeaveRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetLeave {
  _id: string;
  _creationTime: number;
  organizationId: string;
  userId: string;
  type: string;
  leaveTypeId?: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  status: string;
  reason?: string;
  approvedBy?: string;
  approvedAt?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<GabinetLeaveRow, MappedGabinetLeave>({});

export const mapGabinetLeaveFromSupabase = (
  row: GabinetLeaveRow,
): MappedGabinetLeave => {
  const mapped = mapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapGabinetLeaveToSupabase = mapper.mapToSupabase;
