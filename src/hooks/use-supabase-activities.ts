/**
 * React Query hooks for fetching activities from Supabase (PostgreSQL).
 * Entity-attached: activities are filtered by entityType + entityId.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapActivityFromSupabase, type MappedActivity } from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Lead IDs with Recent Activity (for nudge=stale filter)
// ---------------------------------------------------------------------------

/**
 * Returns the set of lead IDs that have had at least one activity within the
 * last `days` window. The leads index page uses the inverse set to apply the
 * `nudge=stale` filter (leads NOT in this set are "stale").
 *
 * Mirrors the backend logic in convex/nudges.ts (getDealsNudges).
 */
export function useSupabaseLeadIdsWithRecentActivity(
  organizationId: string,
  days: number = 7,
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<Set<string>, Error>({
    queryKey: [
      ...supabaseKeys.activities.list(organizationId),
      "leadIdsWithRecentActivity",
      days,
    ],
    queryFn: async (): Promise<Set<string>> => {
      if (!client) throw new Error("Supabase client not ready");

      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

      const { data, error } = await client
        .from("activities")
        .select("entity_id")
        .eq("organization_id", organizationId)
        .eq("entity_type", "lead")
        .gte("created_at", cutoff);

      if (error) throw error;
      return new Set(
        ((data ?? []) as { entity_id: string }[]).map((a) => a.entity_id),
      );
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<Set<string>, Error>);
}

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
