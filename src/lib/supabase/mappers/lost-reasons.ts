/**
 * Lost Reasons Mapper — Supabase ↔ Frontend
 */

import type { LostReasonRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedLostReason {
  _id: string;
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

export const mapLostReasonFromSupabase = lostReasonMapper.mapFromSupabase;
export const mapLostReasonToSupabase = lostReasonMapper.mapToSupabase;
