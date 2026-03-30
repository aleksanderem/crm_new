/**
 * Email Templates Mapper — Supabase ↔ Frontend
 *
 * Maps email_templates table rows to camelCase frontend objects using the generic
 * createEntityMapper factory. Shape mirrors `Doc<'emailTemplates'>` from Convex.
 *
 * JSONB column (variables) is passed through as `unknown` — consumers cast
 * at usage point per Knowledge Pattern #14.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type EmailTemplateRow = Database["public"]["Tables"]["email_templates"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'emailTemplates'>` from Convex (camelCase). */
export interface MappedEmailTemplate {
  _id: string;
  organizationId: string;
  name: string;
  subject: string;
  body: string;
  contentJson?: string;
  renderedHtml?: string;
  slug?: string;
  category?: string;
  module?: string;
  eventType?: string;
  isSystem?: boolean;
  locale?: string;
  requiredSources?: string[];
  variables: unknown;
  createdBy: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const emailTemplateMapper = createEntityMapper<EmailTemplateRow, MappedEmailTemplate>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapEmailTemplateFromSupabase(row: EmailTemplateRow): MappedEmailTemplate {
  return emailTemplateMapper.mapFromSupabase(row);
}

export function mapEmailTemplateToSupabase(
  emailTemplate: Record<string, unknown>,
): Record<string, unknown> {
  return emailTemplateMapper.mapToSupabase(emailTemplate);
}
