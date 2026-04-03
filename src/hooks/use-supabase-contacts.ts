/**
 * React Query hooks for fetching contacts from Supabase (PostgreSQL).
 *
 * These run alongside the existing Convex queries and are gated behind a
 * feature flag (`USE_SUPABASE_READS`). S04 will complete the switchover.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapContactFromSupabase, type MappedContact } from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Contacts List
// ---------------------------------------------------------------------------

interface UseSupabaseContactsListOptions {
  /** Disable the query (defaults to true). */
  enabled?: boolean;
  /** Max rows to fetch (defaults to 100). */
  limit?: number;
  /** Full-text search query (PostgreSQL websearch). */
  search?: string;
  /** Sort direction for created_at (defaults to "desc"). */
  sortOrder?: "asc" | "desc";
}

/**
 * Fetches the contacts list for an organization from PostgreSQL via supabase-js.
 *
 * Returns data in the same camelCase shape as `Doc<'contacts'>` so existing UI
 * components work without changes.
 */
export function useSupabaseContactsList(
  organizationId: string,
  options: UseSupabaseContactsListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100, search, sortOrder = "desc" } = options;

  return useQuery<MappedContact[], Error>({
    queryKey: [...supabaseKeys.contacts.list(organizationId), search ?? ""],
    queryFn: async (): Promise<MappedContact[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("contacts")
        .select("*")
        .eq("organization_id", organizationId);

      const trimmedSearch = search?.trim();
      if (trimmedSearch) {
        query = query.or(
          [
            `first_name.ilike.%${trimmedSearch}%`,
            `last_name.ilike.%${trimmedSearch}%`,
            `email.ilike.%${trimmedSearch}%`,
          ].join(","),
        );
      }

      const { data, error } = await query
        .order("created_at", { ascending: sortOrder === "asc" })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapContactFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedContact[], Error>);
}

// ---------------------------------------------------------------------------
// Single Contact
// ---------------------------------------------------------------------------

interface UseSupabaseContactOptions {
  /** Disable the query (defaults to true). */
  enabled?: boolean;
}

/**
 * Fetches a single contact by ID from PostgreSQL via supabase-js.
 * Used by the detail page (wired in S04).
 */
export function useSupabaseContact(
  organizationId: string,
  contactId: string | undefined,
  options: UseSupabaseContactOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedContact | null, Error>({
    queryKey: supabaseKeys.contacts.detail(organizationId, contactId ?? ""),
    queryFn: async (): Promise<MappedContact | null> => {
      if (!client || !contactId) return null;

      const { data, error } = await client
        .from("contacts")
        .select("*")
        .eq("id", contactId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapContactFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId && !!contactId,
  } satisfies UseQueryOptions<MappedContact | null, Error>);
}
