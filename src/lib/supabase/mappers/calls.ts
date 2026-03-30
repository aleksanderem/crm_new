/**
 * Calls Mapper — Supabase ↔ Frontend
 */

import type { CallRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedCall {
  _id: string;
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

export const mapCallFromSupabase = callMapper.mapFromSupabase;
export const mapCallToSupabase = callMapper.mapToSupabase;
