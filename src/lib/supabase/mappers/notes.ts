/**
 * Notes Mapper — Supabase ↔ Frontend
 */

import type { NoteRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedNote {
  _id: string;
  _creationTime: number;
  organizationId: string;
  entityType: string;
  entityId: string;
  content: string;
  createdBy: string;
  isPinned?: boolean;
  parentNoteId?: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const noteMapper = createEntityMapper<NoteRow, MappedNote>();

export const mapNoteFromSupabase = (row: NoteRow): MappedNote => {
  const mapped = noteMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapNoteToSupabase = noteMapper.mapToSupabase;
