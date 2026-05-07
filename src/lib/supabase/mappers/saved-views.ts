/**
 * Saved Views Mapper — Supabase ↔ Frontend
 */

import type { SavedViewRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedSavedView {
  _id: string;
  _creationTime: number;
  organizationId: string;
  entityType: string;
  name: string;
  filters?: unknown;
  columns?: string[];
  sortField?: string;
  sortDirection?: string;
  isDefault?: boolean;
  isSystem: boolean;
  createdBy: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const savedViewMapper = createEntityMapper<SavedViewRow, MappedSavedView>();

export const mapSavedViewFromSupabase = (
  row: SavedViewRow,
): MappedSavedView => {
  const mapped = savedViewMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapSavedViewToSupabase = savedViewMapper.mapToSupabase;
