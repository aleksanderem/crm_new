/**
 * Gabinet Receipts Mapper — Supabase ↔ Frontend
 */

import type { GabinetReceiptRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetReceipt {
  _id: string;
  _creationTime: number;
  organizationId: string;
  paymentId: string;
  appointmentId?: string | null;
  patientId?: string | null;
  receiptNumber: string;
  issuedAt: number;
  organizationName: string;
  organizationNip?: string | null;
  organizationAddress?: string | null;
  paymentMethod: string;
  itemsJson: string;
  fiscalReceiptId?: string | null;
  pdfStorageId?: string | null;
  pdfUrl?: string | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  locationId?: string | null;
  status: string;
  receiptType: string;
  totalNet?: number;
  totalVat?: number;
  totalGross?: number;
  _source: "supabase";
}

const mapper = createEntityMapper<GabinetReceiptRow, MappedGabinetReceipt>({});

export const mapGabinetReceiptFromSupabase = (
  row: GabinetReceiptRow,
): MappedGabinetReceipt => {
  const mapped = mapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapGabinetReceiptToSupabase = mapper.mapToSupabase;
