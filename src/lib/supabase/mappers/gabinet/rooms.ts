/**
 * Gabinet Rooms Mapper — Supabase ↔ Frontend
 */

import type { GabinetRoomRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetRoom {
  _id: string;
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

export const mapGabinetRoomFromSupabase = mapper.mapFromSupabase;
export const mapGabinetRoomToSupabase = mapper.mapToSupabase;
