/**
 * React Query hooks for fetching gabinet leaves from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetLeaveFromSupabase,
  type MappedGabinetLeave,
} from "@/lib/supabase/mappers/gabinet/leaves";

// ---------------------------------------------------------------------------
// Leaves List
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetLeavesListOptions {
  enabled?: boolean;
  userId?: string;
  status?: string;
  limit?: number;
}

/**
 * Fetches leaves for an organization, with optional user and status filters.
 */
export function useSupabaseGabinetLeavesList(
  organizationId: string,
  options: UseSupabaseGabinetLeavesListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, userId, status, limit = 200 } = options;

  return useQuery<MappedGabinetLeave[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetLeaves.list(organizationId),
      userId ?? "",
      status ?? "",
    ],
    queryFn: async (): Promise<MappedGabinetLeave[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_leaves")
        .select("*")
        .eq("organization_id", organizationId);

      if (userId) {
        query = query.eq("user_id", userId);
      }

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query
        .order("start_date", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetLeaveFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetLeave[], Error>);
}
