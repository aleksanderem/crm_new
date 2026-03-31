/**
 * Gabinet Leave Types Mapper — Supabase ↔ Frontend
 */

import type { GabinetLeaveTypeRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetLeaveType {
  _id: string;
  organizationId: string;
  name: string;
  color?: string;
  isPaid: boolean;
  annualQuotaDays?: number;
  requiresApproval: boolean;
  isActive: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<GabinetLeaveTypeRow, MappedGabinetLeaveType>(
  {},
);

export const mapGabinetLeaveTypeFromSupabase = mapper.mapFromSupabase;
export const mapGabinetLeaveTypeToSupabase = mapper.mapToSupabase;
