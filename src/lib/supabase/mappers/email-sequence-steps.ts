/**
 * Email Sequence Steps Mapper — Supabase ↔ Frontend
 *
 * Maps email_sequence_steps table rows to camelCase frontend objects using the generic
 * createEntityMapper factory. Shape mirrors `Doc<'emailSequenceSteps'>` from Convex.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type EmailSequenceStepRow = Database["public"]["Tables"]["email_sequence_steps"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'emailSequenceSteps'>` from Convex (camelCase). */
export interface MappedEmailSequenceStep {
  _id: string;
  _creationTime: number;
  sequenceId: string;
  organizationId: string;
  order: number;
  delayMs: number;
  templateId: string;
  conditionJson?: string;
  createdAt: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const emailSequenceStepMapper = createEntityMapper<EmailSequenceStepRow, MappedEmailSequenceStep>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapEmailSequenceStepFromSupabase(row: EmailSequenceStepRow): MappedEmailSequenceStep {
  const mapped = emailSequenceStepMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
}

export function mapEmailSequenceStepToSupabase(
  emailSequenceStep: Record<string, unknown>,
): Record<string, unknown> {
  return emailSequenceStepMapper.mapToSupabase(emailSequenceStep);
}
