/**
 * Sources Mapper — Supabase ↔ Frontend
 */

import type { SourceRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedSource {
  _id: string;
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

export const mapSourceFromSupabase = sourceMapper.mapFromSupabase;
export const mapSourceToSupabase = sourceMapper.mapToSupabase;
