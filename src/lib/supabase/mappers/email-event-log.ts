/**
 * Email Event Log Mapper — Supabase ↔ Frontend
 *
 * Maps email_event_log table rows to camelCase frontend objects using the generic
 * createEntityMapper factory. Shape mirrors `Doc<'emailEventLog'>` from Convex.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type EmailEventLogRow = Database["public"]["Tables"]["email_event_log"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'emailEventLog'>` from Convex (camelCase). */
export interface MappedEmailEventLog {
  _id: string;
  organizationId: string;
  eventType: string;
  bindingId?: string;
  templateId?: string;
  recipientEmail: string;
  recipientName?: string;
  status: string;
  payload?: string;
  source?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  idempotencyKey?: string;
  renderedSubject?: string;
  renderedBody?: string;
  errorMessage?: string;
  triggeredBy?: string;
  processedAt?: number;
  createdAt: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const emailEventLogMapper = createEntityMapper<EmailEventLogRow, MappedEmailEventLog>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapEmailEventLogFromSupabase(row: EmailEventLogRow): MappedEmailEventLog {
  return emailEventLogMapper.mapFromSupabase(row);
}

export function mapEmailEventLogToSupabase(
  emailEventLog: Record<string, unknown>,
): Record<string, unknown> {
  return emailEventLogMapper.mapToSupabase(emailEventLog);
}
