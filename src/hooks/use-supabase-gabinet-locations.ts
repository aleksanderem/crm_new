/**
 * React Query hooks for fetching gabinet locations from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetLocationFromSupabase,
  type MappedGabinetLocation,
} from "@/lib/supabase/mappers/gabinet/locations";

// ---------------------------------------------------------------------------
// Locations List
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetLocationsListOptions {
  enabled?: boolean;
  limit?: number;
  activeOnly?: boolean;
  sortOrder?: "asc" | "desc";
}

export function useSupabaseGabinetLocationsList(
  organizationId: string,
  options: UseSupabaseGabinetLocationsListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const {
    enabled = true,
    limit = 100,
    activeOnly,
    sortOrder = "asc",
  } = options;

  return useQuery<MappedGabinetLocation[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetLocations.list(organizationId),
      activeOnly ?? "all",
    ],
    queryFn: async (): Promise<MappedGabinetLocation[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_locations")
        .select("*")
        .eq("organization_id", organizationId);

      if (activeOnly !== undefined) {
        query = query.eq("is_active", activeOnly);
      }

      const { data, error } = await query
        .order("name", { ascending: sortOrder === "asc" })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetLocationFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetLocation[], Error>);
}
