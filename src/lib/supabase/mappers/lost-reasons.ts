/**
 * Lost Reasons Mapper — Supabase ↔ Frontend
 */

import type { LostReasonRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedLostReason {
  _id: string;
  _creationTime: number;
  organizationId: string;
  label: string;
  order: number;
  isActive: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const lostReasonMapper = createEntityMapper<LostReasonRow, MappedLostReason>();

export const mapLostReasonFromSupabase = (
  row: LostReasonRow,
): MappedLostReason => {
  const mapped = lostReasonMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapLostReasonToSupabase = lostReasonMapper.mapToSupabase;
