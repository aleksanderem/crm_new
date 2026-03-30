/**
 * Mail Providers Mapper — Supabase ↔ Frontend
 *
 * Maps mail_providers table rows to camelCase frontend objects using the generic
 * createEntityMapper factory. Shape mirrors `Doc<'mailProviders'>` from Convex.
 *
 * JSONB columns (oauth_tokens, api_config, capabilities) are passed through
 * as `unknown` — consumers cast at usage point per Knowledge Pattern #14.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type MailProviderRow = Database["public"]["Tables"]["mail_providers"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'mailProviders'>` from Convex (camelCase). */
export interface MappedMailProvider {
  _id: string;
  organizationId: string;
  name: string;
  providerType: string;
  oauthTokens?: unknown;
  apiConfig?: unknown;
  fromName: string;
  fromEmail: string;
  replyToEmail?: string;
  capabilities: unknown;
  isDefault: boolean;
  isShared: boolean;
  assignedUserIds?: string[];
  status: string;
  lastSyncAt?: number;
  lastError?: string;
  statusMessage?: string;
  connectedBy?: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const mailProviderMapper = createEntityMapper<MailProviderRow, MappedMailProvider>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapMailProviderFromSupabase(row: MailProviderRow): MappedMailProvider {
  return mailProviderMapper.mapFromSupabase(row);
}

export function mapMailProviderToSupabase(
  mailProvider: Record<string, unknown>,
): Record<string, unknown> {
  return mailProviderMapper.mapToSupabase(mailProvider);
}
