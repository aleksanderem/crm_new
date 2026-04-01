/**
 * Gabinet Document Templates Mapper — Supabase ↔ Frontend
 */

import type { GabinetDocumentTemplateRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetDocumentTemplate {
  _id: string;
  organizationId: string;
  name: string;
  type: string;
  content: string;
  requiresSignature: boolean;
  isActive: boolean;
  sortOrder?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<
  GabinetDocumentTemplateRow,
  MappedGabinetDocumentTemplate
>({});

export const mapGabinetDocumentTemplateFromSupabase = mapper.mapFromSupabase;
export const mapGabinetDocumentTemplateToSupabase = mapper.mapToSupabase;
