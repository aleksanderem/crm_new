/**
 * Email Event Types Mapper — Supabase ↔ Frontend
 *
 * Maps email_event_types table rows to camelCase frontend objects using the generic
 * createEntityMapper factory. Shape mirrors `Doc<'emailEventTypes'>` from Convex.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type EmailEventTypeRow = Database["public"]["Tables"]["email_event_types"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'emailEventTypes'>` from Convex (camelCase). */
export interface MappedEmailEventType {
  _id: string;
  _creationTime: number;
  organizationId: string;
  eventType: string;
  module: string;
  displayName: string;
  description?: string;
  payloadSchema?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const emailEventTypeMapper = createEntityMapper<EmailEventTypeRow, MappedEmailEventType>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapEmailEventTypeFromSupabase(row: EmailEventTypeRow): MappedEmailEventType {
  const mapped = emailEventTypeMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
}

export function mapEmailEventTypeToSupabase(
  emailEventType: Record<string, unknown>,
): Record<string, unknown> {
  return emailEventTypeMapper.mapToSupabase(emailEventType);
}
