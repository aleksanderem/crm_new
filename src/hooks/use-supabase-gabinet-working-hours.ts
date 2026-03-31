/**
 * React Query hooks for fetching gabinet working hours from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetWorkingHoursFromSupabase,
  type MappedGabinetWorkingHours,
} from "@/lib/supabase/mappers/gabinet/working-hours";

// ---------------------------------------------------------------------------
// Working Hours List (by location or org-wide)
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetWorkingHoursListOptions {
  enabled?: boolean;
  limit?: number;
  locationId?: string;
}

export function useSupabaseGabinetWorkingHoursList(
  organizationId: string,
  options: UseSupabaseGabinetWorkingHoursListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100, locationId } = options;

  return useQuery<MappedGabinetWorkingHours[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetWorkingHours.list(organizationId),
      locationId ?? "all",
    ],
    queryFn: async (): Promise<MappedGabinetWorkingHours[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_working_hours")
        .select("*")
        .eq("organization_id", organizationId);

      if (locationId) {
        query = query.eq("location_id", locationId);
      }

      const { data, error } = await query
        .order("day_of_week", { ascending: true })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetWorkingHoursFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetWorkingHours[], Error>);
}
