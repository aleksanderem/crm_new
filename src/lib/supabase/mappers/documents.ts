/**
 * Documents Mapper — Supabase ↔ Frontend
 */

import type { DocumentRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedDocument {
  _id: string;
  organizationId: string;
  name: string;
  description?: string;
  fileId?: string;
  fileUrl?: string;
  mimeType?: string;
  fileSize?: number;
  category?: string;
  tags?: string[];
  tagIds?: string[];
  categoryId?: string;
  status?: string;
  amount?: number;
  sentAt?: number;
  acceptedAt?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const documentMapper = createEntityMapper<DocumentRow, MappedDocument>({
  exclude: ["search_vector"],
});

export const mapDocumentFromSupabase = documentMapper.mapFromSupabase;
export const mapDocumentToSupabase = documentMapper.mapToSupabase;
