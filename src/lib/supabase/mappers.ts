/**
 * Supabase ↔ Convex Field Mappers
 *
 * The PostgreSQL schema uses snake_case columns; the frontend expects camelCase
 * matching `Doc<'contacts'>` from Convex.  These mappers translate between the
 * two so existing UI components work without changes.
 */

import type { Contact as SupabaseContactRow } from "./database.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape that mirrors `Doc<'contacts'>` from Convex (camelCase). */
export interface MappedContact {
  /** Supabase UUID → used as _id surrogate for list rendering */
  _id: string;
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
  /**
   * Marker that lets consuming code distinguish Supabase-sourced records
   * from Convex-sourced records without complex type guards.
   */
  _source: "supabase";
}

// ---------------------------------------------------------------------------
// Supabase → camelCase
// ---------------------------------------------------------------------------

/**
 * Maps a single Supabase `contacts` row (snake_case) to the camelCase shape
 * used by the frontend (`Doc<'contacts'>`-compatible).
 */
export function mapContactFromSupabase(row: SupabaseContactRow): MappedContact {
  return {
    _id: row.id,
    organizationId: row.organization_id,
    firstName: row.first_name,
    lastName: row.last_name ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    title: row.title ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    notes: row.notes ?? undefined,
    tags: row.tags ?? undefined,
    tagIds: row.tag_ids ?? undefined,
    categoryId: row.category_id ?? undefined,
    source: row.source ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    _source: "supabase",
  };
}

// ---------------------------------------------------------------------------
// camelCase → Supabase (for writes — used by T04)
// ---------------------------------------------------------------------------

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

/**
 * Maps a camelCase contact object to the snake_case shape expected by
 * Supabase inserts/updates.
 */
export function mapContactToSupabase(
  contact: ContactWriteInput,
): Omit<SupabaseContactRow, "id"> {
  return {
    organization_id: contact.organizationId,
    first_name: contact.firstName,
    last_name: contact.lastName ?? null,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
    title: contact.title ?? null,
    avatar_url: contact.avatarUrl ?? null,
    notes: contact.notes ?? null,
    tags: contact.tags ?? null,
    tag_ids: contact.tagIds ?? null,
    category_id: contact.categoryId ?? null,
    source: contact.source ?? null,
    created_by: contact.createdBy,
    created_at: contact.createdAt,
    updated_at: contact.updatedAt,
  };
}
