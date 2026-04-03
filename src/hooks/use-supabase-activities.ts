/**
 * React Query hooks for fetching activities from Supabase (PostgreSQL).
 * Entity-attached: activities are filtered by entityType + entityId.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapActivityFromSupabase, type MappedActivity } from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Activities by Entity
// ---------------------------------------------------------------------------

interface UseSupabaseActivitiesListOptions {
  enabled?: boolean;
  limit?: number;
}

/**
 * Fetches activities attached to a specific entity (e.g. company, contact).
 * Returns activities in reverse chronological order.
 */
export function useSupabaseActivitiesByEntity(
  organizationId: string,
  entityType: string,
  entityId: string | undefined,
  options: UseSupabaseActivitiesListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 50 } = options;

  return useQuery<MappedActivity[], Error>({
    queryKey: [...supabaseKeys.activities.list(organizationId), entityType, entityId ?? ""],
    queryFn: async (): Promise<MappedActivity[]> => {
      if (!client || !entityId) return [];

      const { data, error } = await client
        .from("activities")
        .select(`
          *,
          users:users!activities_performed_by_fkey (
            id,
            name,
            email
          )
        `)
        .eq("organization_id", organizationId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapActivityFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!entityId,
  } satisfies UseQueryOptions<MappedActivity[], Error>);
}
