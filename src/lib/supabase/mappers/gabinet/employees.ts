/**
 * Gabinet Employees Mapper — Supabase ↔ Frontend
 */

import type { GabinetEmployeeRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetEmployee {
  _id: string;
  _creationTime: number;
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
  address?: { street?: string; city?: string; postalCode?: string };
  employmentType?: string;
  endDate?: string;
  position?: string;
  department?: string;
  skills?: string[];
  yearsOfExperience?: number;
  certifications?: Array<{ name: string; dateObtained?: string; expiryDate?: string }>;
  assignedItems?: Array<{
    name: string;
    quantity?: number;
    issuedDate?: string;
    returnedDate?: string;
    notes?: string;
  }>;
  baseSalary?: number;
  commissionPercent?: number;
  bankAccount?: string;
  showInCalendar?: boolean;
  tagIds?: string[];
  categoryId?: string;
  bio?: string;
  avatarUrl?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<GabinetEmployeeRow, MappedGabinetEmployee>(
  {},
);

export const mapGabinetEmployeeFromSupabase = (
  row: GabinetEmployeeRow,
): MappedGabinetEmployee => {
  const mapped = mapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapGabinetEmployeeToSupabase = mapper.mapToSupabase;
