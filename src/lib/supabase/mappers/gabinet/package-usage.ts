/**
 * Gabinet Package Usage Mapper — Supabase ↔ Frontend
 *
 * The `treatments_used` column is JSONB in PostgreSQL and returns `unknown`
 * from Supabase. We type it as an array of usage tracking objects.
 */

import type { GabinetPackageUsageRow } from "../../database.types";
import { createEntityMapper } from "../generic";

/** Shape of a single treatment usage entry inside the JSONB treatmentsUsed array. */
export interface PackageTreatmentUsageEntry {
  treatmentId: string;
  variantId?: string;
  usedCount: number;
  totalAllowed: number;
}

export interface MappedGabinetPackageUsage {
  _id: string;
  organizationId: string;
  patientId: string;
  packageId: string;
  purchasedAt: number;
  expiresAt?: number;
  status: string;
  treatmentsUsed: PackageTreatmentUsageEntry[];
  paidAmount: number;
  paymentMethod?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<
  GabinetPackageUsageRow,
  MappedGabinetPackageUsage
>({});

/** Map from Supabase, casting the JSONB `treatments_used` column to its typed array. */
export function mapGabinetPackageUsageFromSupabase(
  row: GabinetPackageUsageRow,
): MappedGabinetPackageUsage {
  const base = mapper.mapFromSupabase(row);
  return {
    ...base,
    treatmentsUsed: (row.treatments_used ?? []) as PackageTreatmentUsageEntry[],
  };
}

export const mapGabinetPackageUsageToSupabase = mapper.mapToSupabase;
