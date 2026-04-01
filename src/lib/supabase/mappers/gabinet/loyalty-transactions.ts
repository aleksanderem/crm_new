/**
 * Gabinet Loyalty Transactions Mapper — Supabase ↔ Frontend
 */

import type { GabinetLoyaltyTransactionRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetLoyaltyTransaction {
  _id: string;
  organizationId: string;
  patientId: string;
  type: string;
  points: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  balanceAfter: number;
  createdBy: string;
  createdAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<
  GabinetLoyaltyTransactionRow,
  MappedGabinetLoyaltyTransaction
>({});

export const mapGabinetLoyaltyTransactionFromSupabase = mapper.mapFromSupabase;
export const mapGabinetLoyaltyTransactionToSupabase = mapper.mapToSupabase;
