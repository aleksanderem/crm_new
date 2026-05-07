/**
 * Calls Mapper — Supabase ↔ Frontend
 */

import type { CallRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedCall {
  _id: string;
  _creationTime: number;
  organizationId: string;
  outcome: string;
  callDate: number;
  note?: string;
  duration?: number;
  tagIds?: string[];
  categoryId?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const callMapper = createEntityMapper<CallRow, MappedCall>();

export const mapCallFromSupabase = (row: CallRow): MappedCall => {
  const mapped = callMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapCallToSupabase = callMapper.mapToSupabase;
