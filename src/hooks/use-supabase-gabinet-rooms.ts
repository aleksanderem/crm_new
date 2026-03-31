/**
 * React Query hooks for fetching gabinet rooms from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetRoomFromSupabase,
  type MappedGabinetRoom,
} from "@/lib/supabase/mappers/gabinet/rooms";

// ---------------------------------------------------------------------------
// Rooms List (by location)
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetRoomsListOptions {
  enabled?: boolean;
  limit?: number;
  locationId?: string;
  activeOnly?: boolean;
  sortOrder?: "asc" | "desc";
}

export function useSupabaseGabinetRoomsList(
  organizationId: string,
  options: UseSupabaseGabinetRoomsListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const {
    enabled = true,
    limit = 100,
    locationId,
    activeOnly,
    sortOrder = "asc",
  } = options;

  return useQuery<MappedGabinetRoom[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetRooms.list(organizationId),
      locationId ?? "all",
      activeOnly ?? "all",
    ],
    queryFn: async (): Promise<MappedGabinetRoom[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_rooms")
        .select("*")
        .eq("organization_id", organizationId);

      if (locationId) {
        query = query.eq("location_id", locationId);
      }

      if (activeOnly !== undefined) {
        query = query.eq("is_active", activeOnly);
      }

      const { data, error } = await query
        .order("name", { ascending: sortOrder === "asc" })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetRoomFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetRoom[], Error>);
}
