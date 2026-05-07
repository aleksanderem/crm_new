/**
 * Gabinet Equipment Transfers Mapper — Supabase ↔ Frontend
 */

import type { GabinetEquipmentTransferRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetEquipmentTransfer {
  _id: string;
  _creationTime: number;
  organizationId: string;
  equipmentId: string;
  fromLocationId?: string;
  toLocationId: string;
  toRoomId?: string;
  transferredBy: string;
  transferredAt: number;
  notes?: string;
  _source: "supabase";
}

const mapper = createEntityMapper<
  GabinetEquipmentTransferRow,
  MappedGabinetEquipmentTransfer
>({});

export const mapGabinetEquipmentTransferFromSupabase = (
  row: GabinetEquipmentTransferRow,
): MappedGabinetEquipmentTransfer => {
  const mapped = mapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.transferredAt };
};
export const mapGabinetEquipmentTransferToSupabase = mapper.mapToSupabase;
