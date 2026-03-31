/**
 * React Query hooks for fetching gabinet leave balances from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetLeaveBalanceFromSupabase,
  type MappedGabinetLeaveBalance,
} from "@/lib/supabase/mappers/gabinet/leave-balances";

// ---------------------------------------------------------------------------
// Leave Balances List (by employee)
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetLeaveBalancesListOptions {
  enabled?: boolean;
  limit?: number;
  employeeId?: string;
  year?: number;
}

export function useSupabaseGabinetLeaveBalancesList(
  organizationId: string,
  options: UseSupabaseGabinetLeaveBalancesListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100, employeeId, year } = options;

  return useQuery<MappedGabinetLeaveBalance[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetLeaveBalances.list(organizationId),
      employeeId ?? "all",
      year ?? "all",
    ],
    queryFn: async (): Promise<MappedGabinetLeaveBalance[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_leave_balances")
        .select("*")
        .eq("organization_id", organizationId);

      if (employeeId) {
        query = query.eq("employee_id", employeeId);
      }

      if (year !== undefined) {
        query = query.eq("year", year);
      }

      const { data, error } = await query
        .order("year", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetLeaveBalanceFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetLeaveBalance[], Error>);
}
