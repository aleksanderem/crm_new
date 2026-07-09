/**
 * Gabinet Appointments Mapper — Supabase ↔ Frontend
 */

import type { GabinetAppointmentRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetAppointment {
  _id: string;
  _creationTime: number;
  organizationId: string;
  patientId: string;
  treatmentId?: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  notes?: string;
  internalNotes?: string;
  bodyChartData?: string;
  treatmentParameterValues?: string;
  interviewNotes?: string;
  clinicalRemarks?: string;
  photos?: unknown;
  color?: string;
  isRecurring: boolean;
  recurringRule?: unknown;
  recurringGroupId?: string;
  recurringIndex?: number;
  prepaymentRequired?: boolean;
  prepaymentAmount?: number;
  prepaymentStatus?: string;
  prepaymentPaidAt?: number;
  packageUsageId?: string;
  scheduledActivityId?: string;
  reminderSentAt?: number;
  sendReminder?: boolean;
  reminderOverrides?: string;
  cancelledAt?: number;
  cancelledBy?: string;
  cancellationReason?: string;
  bookedFromPortal?: boolean;
  bookedByPatientId?: string;
  locationId?: string;
  roomId?: string;
  variantId?: string;
  tagIds?: string[];
  categoryId?: string;
  requiresCompletion?: boolean;
  priceAtBooking?: number;
  contraindicationAlertsReviewed?: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<GabinetAppointmentRow, MappedGabinetAppointment>({});

export const mapGabinetAppointmentFromSupabase = (
  row: GabinetAppointmentRow,
): MappedGabinetAppointment => {
  const mapped = mapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapGabinetAppointmentToSupabase = mapper.mapToSupabase;
