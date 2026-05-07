/**
 * Gabinet Rooms Mapper — Supabase ↔ Frontend
 */

import type { GabinetRoomRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetRoom {
  _id: string;
  _creationTime: number;
  organizationId: string;
  locationId: string;
  name: string;
  description?: string;
  floor?: string;
  isActive: boolean;
  createdAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<GabinetRoomRow, MappedGabinetRoom>({});

export const mapGabinetRoomFromSupabase = (
  row: GabinetRoomRow,
): MappedGabinetRoom => {
  const mapped = mapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapGabinetRoomToSupabase = mapper.mapToSupabase;
