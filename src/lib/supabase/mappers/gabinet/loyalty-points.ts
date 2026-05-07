/**
 * Gabinet Loyalty Points Mapper — Supabase ↔ Frontend
 */

import type { GabinetLoyaltyPointsRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetLoyaltyPoints {
  _id: string;
  _creationTime: number;
  organizationId: string;
  patientId: string;
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  tier?: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<
  GabinetLoyaltyPointsRow,
  MappedGabinetLoyaltyPoints
>({});

export const mapGabinetLoyaltyPointsFromSupabase = (
  row: GabinetLoyaltyPointsRow,
): MappedGabinetLoyaltyPoints => {
  const mapped = mapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapGabinetLoyaltyPointsToSupabase = mapper.mapToSupabase;
