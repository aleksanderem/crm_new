/**
 * Gabinet Treatments Mapper — Supabase ↔ Frontend
 */

import type { GabinetTreatmentRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetTreatment {
  _id: string;
  _creationTime: number;
  organizationId: string;
  name: string;
  description?: string;
  category?: string;
  duration: number;
  price: number;
  currency?: string;
  taxRate?: number;
  taxExempt?: boolean;
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
  packageId?: string;
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

export const mapGabinetTreatmentFromSupabase = (
  row: GabinetTreatmentRow,
): MappedGabinetTreatment => {
  const mapped = mapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapGabinetTreatmentToSupabase = mapper.mapToSupabase;
