/**
 * Gabinet Documents Mapper — Supabase ↔ Frontend
 */

import type { GabinetDocumentRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetDocument {
  _id: string;
  organizationId: string;
  patientId: string;
  appointmentId?: string;
  templateId?: string;
  title: string;
  type: string;
  content: string;
  status: string;
  signatureData?: string;
  signedAt?: number;
  signedByPatient?: boolean;
  signedByEmployee?: string;
  fileStorageId?: string;
  fileName?: string;
  fileMimeType?: string;
  tagIds?: string[];
  categoryId?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<GabinetDocumentRow, MappedGabinetDocument>(
  {},
);

export const mapGabinetDocumentFromSupabase = mapper.mapFromSupabase;
export const mapGabinetDocumentToSupabase = mapper.mapToSupabase;
