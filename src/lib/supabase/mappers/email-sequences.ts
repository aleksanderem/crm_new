/**
 * Email Sequences Mapper — Supabase ↔ Frontend
 *
 * Maps email_sequences table rows to camelCase frontend objects using the generic
 * createEntityMapper factory. Shape mirrors `Doc<'emailSequences'>` from Convex.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type EmailSequenceRow = Database["public"]["Tables"]["email_sequences"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'emailSequences'>` from Convex (camelCase). */
export interface MappedEmailSequence {
  _id: string;
  organizationId: string;
  name: string;
  triggerEventType: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const emailSequenceMapper = createEntityMapper<EmailSequenceRow, MappedEmailSequence>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapEmailSequenceFromSupabase(row: EmailSequenceRow): MappedEmailSequence {
  return emailSequenceMapper.mapFromSupabase(row);
}

export function mapEmailSequenceToSupabase(
  emailSequence: Record<string, unknown>,
): Record<string, unknown> {
  return emailSequenceMapper.mapToSupabase(emailSequence);
}
