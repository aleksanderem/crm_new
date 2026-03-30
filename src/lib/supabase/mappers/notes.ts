/**
 * Notes Mapper — Supabase ↔ Frontend
 */

import type { NoteRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedNote {
  _id: string;
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

export const mapNoteFromSupabase = noteMapper.mapFromSupabase;
export const mapNoteToSupabase = noteMapper.mapToSupabase;
