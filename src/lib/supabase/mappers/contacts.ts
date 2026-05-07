/**
 * Contacts Mapper — Supabase ↔ Frontend
 *
 * Refactored to use the generic createEntityMapper factory while preserving
 * the exact same MappedContact shape and function signatures for backward
 * compatibility.
 */

import type { Contact as SupabaseContactRow } from "../database.types";
import { createEntityMapper } from "./generic";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'contacts'>` from Convex (camelCase). */
export interface MappedContact {
  /** Supabase UUID → used as _id surrogate for list rendering */
  _id: string;
  _creationTime: number;
  organizationId: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  title?: string;
  avatarUrl?: string;
  notes?: string;
  tags?: string[];
  tagIds?: string[];
  categoryId?: string;
  source?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

/** Fields accepted for a Supabase contact insert/update (camelCase input). */
export interface ContactWriteInput {
  organizationId: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  avatarUrl?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  tagIds?: string[] | null;
  categoryId?: string | null;
  source?: string | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const contactMapper = createEntityMapper<SupabaseContactRow, MappedContact>({
  exclude: ["search_vector"],
});

// ─── Exported Functions (backward-compatible signatures) ──────────────────────

export function mapContactFromSupabase(row: SupabaseContactRow): MappedContact {
  const mapped = contactMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
}

export function mapContactToSupabase(
  contact: ContactWriteInput,
): Omit<SupabaseContactRow, "id"> {
  return contactMapper.mapToSupabase(
    contact as unknown as Record<string, unknown>,
  ) as Omit<SupabaseContactRow, "id">;
}
