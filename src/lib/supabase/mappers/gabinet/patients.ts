/**
 * Gabinet Patients Mapper — Supabase ↔ Frontend
 */

import type { GabinetPatientRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetPatient {
  _id: string;
  _creationTime: number;
  organizationId: string;
  contactId?: string;
  firstName: string;
  lastName: string;
  pesel?: string;
  dateOfBirth?: string;
  gender?: string;
  email: string;
  phone?: string;
  address?: unknown;
  medicalNotes?: string;
  allergies?: string;
  bloodType?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  referralSource?: string;
  referredByPatientId?: string;
  isActive: boolean;
  tags?: string[];
  tagIds?: string[];
  categoryId?: string;
  customFields?: unknown;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<GabinetPatientRow, MappedGabinetPatient>({});

export const mapGabinetPatientFromSupabase = (
  row: GabinetPatientRow,
): MappedGabinetPatient => {
  const mapped = mapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapGabinetPatientToSupabase = mapper.mapToSupabase;
