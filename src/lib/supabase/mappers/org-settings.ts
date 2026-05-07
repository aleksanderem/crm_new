/**
 * Org Settings Mapper — Supabase ↔ Frontend
 */

import type { OrgSettingsRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedOrgSettings {
  _id: string;
  _creationTime: number;
  organizationId: string;
  allowCustomLostReason: boolean;
  lostReasonRequired: boolean;
  defaultCurrency?: string;
  timezone?: string;
  resourceSharingEnabled?: boolean;
  reminderEnabled?: boolean;
  reminderHoursBefore?: number;
  appointmentWorkflowConfig?: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const orgSettingsMapper = createEntityMapper<OrgSettingsRow, MappedOrgSettings>({});

export const mapOrgSettingsFromSupabase = (
  row: OrgSettingsRow,
): MappedOrgSettings => {
  const mapped = orgSettingsMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapOrgSettingsToSupabase = orgSettingsMapper.mapToSupabase;
