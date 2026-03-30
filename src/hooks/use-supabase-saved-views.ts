/**
 * React Query hooks for fetching saved views from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapSavedViewFromSupabase, type MappedSavedView } from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Saved Views by Entity Type
// ---------------------------------------------------------------------------

interface UseSupabaseSavedViewsListOptions {
  enabled?: boolean;
  entityType: string;
}

export function useSupabaseSavedViewsList(
  organizationId: string,
  options: UseSupabaseSavedViewsListOptions,
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, entityType } = options;

  return useQuery<MappedSavedView[], Error>({
    queryKey: [...supabaseKeys.savedViews.list(organizationId), entityType],
    queryFn: async (): Promise<MappedSavedView[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("saved_views")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("entity_type", entityType)
        .order("order", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapSavedViewFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!entityType,
  } satisfies UseQueryOptions<MappedSavedView[], Error>);
}
