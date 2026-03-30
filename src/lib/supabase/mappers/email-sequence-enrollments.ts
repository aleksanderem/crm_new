/**
 * Email Sequence Enrollments Mapper — Supabase ↔ Frontend
 *
 * Maps email_sequence_enrollments table rows to camelCase frontend objects using the generic
 * createEntityMapper factory. Shape mirrors `Doc<'emailSequenceEnrollments'>` from Convex.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type EmailSequenceEnrollmentRow = Database["public"]["Tables"]["email_sequence_enrollments"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'emailSequenceEnrollments'>` from Convex (camelCase). */
export interface MappedEmailSequenceEnrollment {
  _id: string;
  sequenceId: string;
  organizationId: string;
  recipientEmail: string;
  recipientName?: string;
  payload?: string;
  currentStep: number;
  status: string;
  enrolledAt: number;
  completedAt?: number;
  cancelledAt?: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const emailSequenceEnrollmentMapper = createEntityMapper<EmailSequenceEnrollmentRow, MappedEmailSequenceEnrollment>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapEmailSequenceEnrollmentFromSupabase(row: EmailSequenceEnrollmentRow): MappedEmailSequenceEnrollment {
  return emailSequenceEnrollmentMapper.mapFromSupabase(row);
}

export function mapEmailSequenceEnrollmentToSupabase(
  emailSequenceEnrollment: Record<string, unknown>,
): Record<string, unknown> {
  return emailSequenceEnrollmentMapper.mapToSupabase(emailSequenceEnrollment);
}
