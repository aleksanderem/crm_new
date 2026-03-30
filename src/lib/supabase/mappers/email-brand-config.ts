/**
 * Email Brand Config Mapper — Supabase ↔ Frontend
 *
 * Maps email_brand_config table rows to camelCase frontend objects using the generic
 * createEntityMapper factory. Shape mirrors `Doc<'emailBrandConfig'>` from Convex.
 *
 * JSONB column (social_links) is passed through as `unknown` — consumers cast
 * at usage point per Knowledge Pattern #14.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type EmailBrandConfigRow = Database["public"]["Tables"]["email_brand_config"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'emailBrandConfig'>` from Convex (camelCase). */
export interface MappedEmailBrandConfig {
  _id: string;
  organizationId: string;
  logoStorageId?: string;
  logoUrl?: string;
  companyName?: string;
  primaryColor: string;
  backgroundColor: string;
  contentBackgroundColor: string;
  textColor: string;
  secondaryTextColor: string;
  accentColor: string;
  footerText?: string;
  socialLinks?: unknown;
  createdBy: string;
  createdAt: number;
  updatedBy: string;
  updatedAt: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const emailBrandConfigMapper = createEntityMapper<EmailBrandConfigRow, MappedEmailBrandConfig>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapEmailBrandConfigFromSupabase(row: EmailBrandConfigRow): MappedEmailBrandConfig {
  return emailBrandConfigMapper.mapFromSupabase(row);
}

export function mapEmailBrandConfigToSupabase(
  emailBrandConfig: Record<string, unknown>,
): Record<string, unknown> {
  return emailBrandConfigMapper.mapToSupabase(emailBrandConfig);
}
