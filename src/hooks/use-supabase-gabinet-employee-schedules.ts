/**
 * React Query hooks for fetching gabinet employee schedules from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetEmployeeScheduleFromSupabase,
  type MappedGabinetEmployeeSchedule,
} from "@/lib/supabase/mappers/gabinet/employee-schedules";

// ---------------------------------------------------------------------------
// Employee Schedules List (by employee)
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetEmployeeSchedulesListOptions {
  enabled?: boolean;
  limit?: number;
  userId?: string;
  locationId?: string;
}

export function useSupabaseGabinetEmployeeSchedulesList(
  organizationId: string,
  options: UseSupabaseGabinetEmployeeSchedulesListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100, userId, locationId } = options;

  return useQuery<MappedGabinetEmployeeSchedule[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetEmployeeSchedules.list(organizationId),
      userId ?? "all",
      locationId ?? "all",
    ],
    queryFn: async (): Promise<MappedGabinetEmployeeSchedule[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_employee_schedules")
        .select("*")
        .eq("organization_id", organizationId);

      if (userId) {
        query = query.eq("user_id", userId);
      }

      if (locationId) {
        query = query.eq("location_id", locationId);
      }

      const { data, error } = await query
        .order("day_of_week", { ascending: true })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetEmployeeScheduleFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetEmployeeSchedule[], Error>);
}
