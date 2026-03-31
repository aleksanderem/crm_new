/**
 * Gabinet Locations Mapper — Supabase ↔ Frontend
 */

import type { GabinetLocationRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetLocation {
  _id: string;
  organizationId: string;
  name: string;
  address?: unknown;
  phone?: string;
  email?: string;
  color?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
  _source: "supabase";
}

const mapper = createEntityMapper<GabinetLocationRow, MappedGabinetLocation>(
  {},
);

export const mapGabinetLocationFromSupabase = mapper.mapFromSupabase;
export const mapGabinetLocationToSupabase = mapper.mapToSupabase;
