/**
 * React Query hooks for fetching calls from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapCallFromSupabase, type MappedCall } from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Calls List
// ---------------------------------------------------------------------------

interface UseSupabaseCallsListOptions {
  enabled?: boolean;
  limit?: number;
  sortOrder?: "asc" | "desc";
}

export function useSupabaseCallsList(
  organizationId: string,
  options: UseSupabaseCallsListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100, sortOrder = "desc" } = options;

  return useQuery<MappedCall[], Error>({
    queryKey: supabaseKeys.calls.list(organizationId),
    queryFn: async (): Promise<MappedCall[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("calls")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: sortOrder === "asc" })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapCallFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedCall[], Error>);
}
