/**
 * Email Event Bindings Mapper — Supabase ↔ Frontend
 *
 * Maps email_event_bindings table rows to camelCase frontend objects using the generic
 * createEntityMapper factory. Shape mirrors `Doc<'emailEventBindings'>` from Convex.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type EmailEventBindingRow = Database["public"]["Tables"]["email_event_bindings"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'emailEventBindings'>` from Convex (camelCase). */
export interface MappedEmailEventBinding {
  _id: string;
  organizationId: string;
  eventType: string;
  templateId: string;
  enabled: boolean;
  priority: number;
  conditions?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const emailEventBindingMapper = createEntityMapper<EmailEventBindingRow, MappedEmailEventBinding>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapEmailEventBindingFromSupabase(row: EmailEventBindingRow): MappedEmailEventBinding {
  return emailEventBindingMapper.mapFromSupabase(row);
}

export function mapEmailEventBindingToSupabase(
  emailEventBinding: Record<string, unknown>,
): Record<string, unknown> {
  return emailEventBindingMapper.mapToSupabase(emailEventBinding);
}
