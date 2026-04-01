/**
 * Gabinet Overtime Mapper — Supabase ↔ Frontend
 */

import type { GabinetOvertimeRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetOvertime {
  _id: string;
  organizationId: string;
  userId: string;
  date: string;
  hours: number;
  reason?: string;
  status: string;
  approvedBy?: string;
  approvedAt?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<GabinetOvertimeRow, MappedGabinetOvertime>({});

export const mapGabinetOvertimeFromSupabase = mapper.mapFromSupabase;
export const mapGabinetOvertimeToSupabase = mapper.mapToSupabase;
