/**
 * Sources Mapper — Supabase ↔ Frontend
 */

import type { SourceRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedSource {
  _id: string;
  _creationTime: number;
  organizationId: string;
  name: string;
  order: number;
  isActive: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const sourceMapper = createEntityMapper<SourceRow, MappedSource>();

export const mapSourceFromSupabase = (row: SourceRow): MappedSource => {
  const mapped = sourceMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapSourceToSupabase = sourceMapper.mapToSupabase;
