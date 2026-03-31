/**
 * Gabinet Treatments Mapper — Supabase ↔ Frontend
 */

import type { GabinetTreatmentRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetTreatment {
  _id: string;
  organizationId: string;
  name: string;
  description?: string;
  category?: string;
  duration: number;
  price: number;
  currency?: string;
  taxRate?: number;
  requiredEquipment?: string[];
  requiredEquipmentIds?: string[];
  contraindications?: string;
  preparationInstructions?: string;
  aftercareInstructions?: string;
  isActive: boolean;
  requiresApproval?: boolean;
  color?: string;
  sortOrder?: number;
  treatmentCount?: number;
  parameters?: unknown;
  requiredDocumentTemplateIds?: string[];
  requiredFormTemplates?: unknown;
  shortDescription?: string;
  image?: string;
  tagIds?: string[];
  categoryId?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<GabinetTreatmentRow, MappedGabinetTreatment>(
  {},
);

export const mapGabinetTreatmentFromSupabase = mapper.mapFromSupabase;
export const mapGabinetTreatmentToSupabase = mapper.mapToSupabase;
