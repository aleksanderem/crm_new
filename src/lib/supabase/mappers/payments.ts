/**
 * Payments Mapper — Supabase ↔ Frontend
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

export interface MappedPayment {
  _id: string;
  _creationTime: number;
  organizationId: string;
  patientId?: string;
  appointmentId?: string;
  packageUsageId?: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: string;
  paidAt?: number;
  notes?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  creditEarned?: number;
  creditApplied?: number;
  kind?: string;
  discountAmount?: number;
  discountPercent?: number;
  _source: "supabase";
}

const mapper = createEntityMapper<PaymentRow, MappedPayment>({});

export const mapPaymentFromSupabase = (row: PaymentRow): MappedPayment => {
  const mapped = mapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapPaymentToSupabase = mapper.mapToSupabase;
