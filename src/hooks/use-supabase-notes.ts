/**
 * React Query hooks for fetching notes from Supabase (PostgreSQL).
 * Entity-attached: notes are filtered by entityType + entityId.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapNoteFromSupabase, type MappedNote } from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Notes by Entity
// ---------------------------------------------------------------------------

interface UseSupabaseNotesListOptions {
  enabled?: boolean;
  limit?: number;
}

/**
 * Fetches notes attached to a specific entity (e.g. company, contact).
 */
export function useSupabaseNotesByEntity(
  organizationId: string,
  entityType: string,
  entityId: string | undefined,
  options: UseSupabaseNotesListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100 } = options;

  return useQuery<MappedNote[], Error>({
    queryKey: [...supabaseKeys.notes.list(organizationId), entityType, entityId ?? ""],
    queryFn: async (): Promise<MappedNote[]> => {
      if (!client || !entityId) return [];

      const { data, error } = await client
        .from("notes")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapNoteFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!entityId,
  } satisfies UseQueryOptions<MappedNote[], Error>);
}
