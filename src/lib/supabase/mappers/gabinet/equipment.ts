/**
 * Gabinet Equipment Mapper — Supabase ↔ Frontend
 */

import type { GabinetEquipmentRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetEquipment {
  _id: string;
  _creationTime: number;
  organizationId: string;
  name: string;
  description?: string;
  serialNumber?: string;
  currentLocationId?: string;
  currentRoomId?: string;
  status: string;
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
  _source: "supabase";
}

const mapper = createEntityMapper<GabinetEquipmentRow, MappedGabinetEquipment>(
  {},
);

export const mapGabinetEquipmentFromSupabase = (
  row: GabinetEquipmentRow,
): MappedGabinetEquipment => {
  const mapped = mapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapGabinetEquipmentToSupabase = mapper.mapToSupabase;
