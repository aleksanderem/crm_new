/**
 * Email Layouts Mapper — Supabase ↔ Frontend
 *
 * Maps email_layouts table rows to camelCase frontend objects using the generic
 * createEntityMapper factory. Shape mirrors `Doc<'emailLayouts'>` from Convex.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type EmailLayoutRow = Database["public"]["Tables"]["email_layouts"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'emailLayouts'>` from Convex (camelCase). */
export interface MappedEmailLayout {
  _id: string;
  organizationId: string;
  headerBlocks: string;
  footerBlocks: string;
  backgroundColor: string;
  contentBackgroundColor: string;
  primaryColor: string;
  logoUrl?: string;
  companyName?: string;
  footerText?: string;
  updatedBy: string;
  updatedAt: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const emailLayoutMapper = createEntityMapper<EmailLayoutRow, MappedEmailLayout>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapEmailLayoutFromSupabase(row: EmailLayoutRow): MappedEmailLayout {
  return emailLayoutMapper.mapFromSupabase(row);
}

export function mapEmailLayoutToSupabase(
  emailLayout: Record<string, unknown>,
): Record<string, unknown> {
  return emailLayoutMapper.mapToSupabase(emailLayout);
}
