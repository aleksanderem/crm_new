/**
 * Email Accounts Mapper — Supabase ↔ Frontend
 *
 * Maps email_accounts table rows to camelCase frontend objects using the generic
 * createEntityMapper factory. Shape mirrors `Doc<'emailAccounts'>` from Convex.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type EmailAccountRow = Database["public"]["Tables"]["email_accounts"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'emailAccounts'>` from Convex (camelCase). */
export interface MappedEmailAccount {
  _id: string;
  _creationTime: number;
  organizationId: string;
  fromName: string;
  fromEmail: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const emailAccountMapper = createEntityMapper<EmailAccountRow, MappedEmailAccount>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapEmailAccountFromSupabase(row: EmailAccountRow): MappedEmailAccount {
  const mapped = emailAccountMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
}

export function mapEmailAccountToSupabase(
  emailAccount: Record<string, unknown>,
): Record<string, unknown> {
  return emailAccountMapper.mapToSupabase(emailAccount);
}
