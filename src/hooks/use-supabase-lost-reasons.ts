/**
 * React Query hooks for fetching lost reasons from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapLostReasonFromSupabase, type MappedLostReason } from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Lost Reasons List
// ---------------------------------------------------------------------------

interface UseSupabaseLostReasonsListOptions {
  enabled?: boolean;
}

export function useSupabaseLostReasonsList(
  organizationId: string,
  options: UseSupabaseLostReasonsListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedLostReason[], Error>({
    queryKey: supabaseKeys.lostReasons.list(organizationId),
    queryFn: async (): Promise<MappedLostReason[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("lost_reasons")
        .select("*")
        .eq("organization_id", organizationId)
        .order("order", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapLostReasonFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedLostReason[], Error>);
}
