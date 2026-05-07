/**
 * Gabinet Employee Schedules Mapper — Supabase ↔ Frontend
 */

import type { GabinetEmployeeScheduleRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetEmployeeSchedule {
  _id: string;
  _creationTime: number;
  organizationId: string;
  userId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isWorking: boolean;
  breakStart?: string;
  breakEnd?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  locationId?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<
  GabinetEmployeeScheduleRow,
  MappedGabinetEmployeeSchedule
>({});

export const mapGabinetEmployeeScheduleFromSupabase = (
  row: GabinetEmployeeScheduleRow,
): MappedGabinetEmployeeSchedule => {
  const mapped = mapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapGabinetEmployeeScheduleToSupabase = mapper.mapToSupabase;
