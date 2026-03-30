/**
 * React Query hooks for fetching sources from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapSourceFromSupabase, type MappedSource } from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Sources List
// ---------------------------------------------------------------------------

interface UseSupabaseSourcesListOptions {
  enabled?: boolean;
}

export function useSupabaseSourcesList(
  organizationId: string,
  options: UseSupabaseSourcesListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedSource[], Error>({
    queryKey: supabaseKeys.sources.list(organizationId),
    queryFn: async (): Promise<MappedSource[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("sources")
        .select("*")
        .eq("organization_id", organizationId)
        .order("order", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapSourceFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedSource[], Error>);
}
