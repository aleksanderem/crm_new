/**
 * React Query hooks for fetching gabinet overtime from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetOvertimeFromSupabase,
  type MappedGabinetOvertime,
} from "@/lib/supabase/mappers/gabinet/overtime";

// ---------------------------------------------------------------------------
// Overtime List
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetOvertimeListOptions {
  enabled?: boolean;
  userId?: string;
  limit?: number;
}

/**
 * Fetches overtime entries for an organization, with optional user filter.
 */
export function useSupabaseGabinetOvertimeList(
  organizationId: string,
  options: UseSupabaseGabinetOvertimeListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, userId, limit = 200 } = options;

  return useQuery<MappedGabinetOvertime[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetOvertime.list(organizationId),
      userId ?? "",
    ],
    queryFn: async (): Promise<MappedGabinetOvertime[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_overtime")
        .select("*")
        .eq("organization_id", organizationId);

      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query
        .order("date", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetOvertimeFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetOvertime[], Error>);
}
