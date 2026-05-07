/**
 * Gabinet Loyalty Transactions Mapper — Supabase ↔ Frontend
 */

import type { GabinetLoyaltyTransactionRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetLoyaltyTransaction {
  _id: string;
  _creationTime: number;
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

export const mapGabinetLoyaltyTransactionFromSupabase = (
  row: GabinetLoyaltyTransactionRow,
): MappedGabinetLoyaltyTransaction => {
  const mapped = mapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapGabinetLoyaltyTransactionToSupabase = mapper.mapToSupabase;
