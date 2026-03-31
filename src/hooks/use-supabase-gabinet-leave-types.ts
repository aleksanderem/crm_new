/**
 * React Query hooks for fetching gabinet leave types from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetLeaveTypeFromSupabase,
  type MappedGabinetLeaveType,
} from "@/lib/supabase/mappers/gabinet/leave-types";

// ---------------------------------------------------------------------------
// Leave Types List
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetLeaveTypesListOptions {
  enabled?: boolean;
  limit?: number;
  activeOnly?: boolean;
  sortOrder?: "asc" | "desc";
}

export function useSupabaseGabinetLeaveTypesList(
  organizationId: string,
  options: UseSupabaseGabinetLeaveTypesListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const {
    enabled = true,
    limit = 100,
    activeOnly,
    sortOrder = "asc",
  } = options;

  return useQuery<MappedGabinetLeaveType[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetLeaveTypes.list(organizationId),
      activeOnly ?? "all",
    ],
    queryFn: async (): Promise<MappedGabinetLeaveType[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_leave_types")
        .select("*")
        .eq("organization_id", organizationId);

      if (activeOnly !== undefined) {
        query = query.eq("is_active", activeOnly);
      }

      const { data, error } = await query
        .order("name", { ascending: sortOrder === "asc" })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetLeaveTypeFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetLeaveType[], Error>);
}
