/**
 * Gabinet Loyalty Points Mapper — Supabase ↔ Frontend
 */

import type { GabinetLoyaltyPointsRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetLoyaltyPoints {
  _id: string;
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

export const mapGabinetLoyaltyPointsFromSupabase = mapper.mapFromSupabase;
export const mapGabinetLoyaltyPointsToSupabase = mapper.mapToSupabase;
