/**
 * Gabinet Treatment Variants Mapper — Supabase ↔ Frontend
 */

import type { GabinetTreatmentVariantRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetTreatmentVariant {
  _id: string;
  organizationId: string;
  treatmentId: string;
  name: string;
  price?: number;
  duration?: number;
  description?: string;
  shortDescription?: string;
  image?: string;
  isActive?: boolean;
  sortOrder?: number;
  _source: "supabase";
}

const mapper = createEntityMapper<
  GabinetTreatmentVariantRow,
  MappedGabinetTreatmentVariant
>({});

export const mapGabinetTreatmentVariantFromSupabase = mapper.mapFromSupabase;
export const mapGabinetTreatmentVariantToSupabase = mapper.mapToSupabase;
