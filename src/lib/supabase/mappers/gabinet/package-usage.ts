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
  totalCount: number;
}

export interface MappedGabinetPackageUsage {
  _id: string;
  _creationTime: number;
  organizationId: string;
  patientId: string | null;
  packageId: string;
  purchasedAt: number;
  expiresAt?: number;
  status: string;
  treatmentsUsed: PackageTreatmentUsageEntry[];
  paidAmount: number;
  paymentMethod?: string;
  isGift?: boolean;
  voucherCode?: string;
  giftRecipientName?: string;
  giftRecipientPhone?: string;
  giftRecipientEmail?: string;
  soldByEmployeeId?: string;
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
    _creationTime: base.createdAt,
    patientId: row.patient_id ?? null,
    treatmentsUsed: (row.treatments_used ?? []) as PackageTreatmentUsageEntry[],
    isGift: row.is_gift ?? undefined,
    voucherCode: row.voucher_code ?? undefined,
    giftRecipientName: row.gift_recipient_name ?? undefined,
    giftRecipientPhone: row.gift_recipient_phone ?? undefined,
    giftRecipientEmail: row.gift_recipient_email ?? undefined,
    soldByEmployeeId: row.sold_by_employee_id ?? undefined,
  };
}

export const mapGabinetPackageUsageToSupabase = mapper.mapToSupabase;
