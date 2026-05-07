/**
 * Gabinet Working Hours Mapper — Supabase ↔ Frontend
 */

import type { GabinetWorkingHoursRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetWorkingHours {
  _id: string;
  _creationTime: number;
  organizationId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isOpen: boolean;
  breakStart?: string;
  breakEnd?: string;
  locationId?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<
  GabinetWorkingHoursRow,
  MappedGabinetWorkingHours
>({});

export const mapGabinetWorkingHoursFromSupabase = (
  row: GabinetWorkingHoursRow,
): MappedGabinetWorkingHours => {
  const mapped = mapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapGabinetWorkingHoursToSupabase = mapper.mapToSupabase;
