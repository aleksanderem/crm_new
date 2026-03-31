/**
 * Gabinet Employees Mapper — Supabase ↔ Frontend
 */

import type { GabinetEmployeeRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetEmployee {
  _id: string;
  organizationId: string;
  userId: string;
  firstName?: string;
  lastName?: string;
  role: string;
  specialization?: string;
  qualifiedTreatmentIds: string[];
  licenseNumber?: string;
  hireDate?: string;
  isActive: boolean;
  color?: string;
  notes?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  pesel?: string;
  address?: unknown;
  employmentType?: string;
  endDate?: string;
  position?: string;
  department?: string;
  skills?: string[];
  yearsOfExperience?: number;
  certifications?: unknown;
  baseSalary?: number;
  commissionPercent?: number;
  bankAccount?: string;
  tagIds?: string[];
  categoryId?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<GabinetEmployeeRow, MappedGabinetEmployee>(
  {},
);

export const mapGabinetEmployeeFromSupabase = mapper.mapFromSupabase;
export const mapGabinetEmployeeToSupabase = mapper.mapToSupabase;
