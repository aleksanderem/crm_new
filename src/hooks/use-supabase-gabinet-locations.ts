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
import {
  mapGabinetRoomFromSupabase,
  type MappedGabinetRoom,
} from "@/lib/supabase/mappers/gabinet/rooms";

export type MappedGabinetLocationWithRooms = MappedGabinetLocation & {
  rooms: MappedGabinetRoom[];
};

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

// ---------------------------------------------------------------------------
// Current User's Employee Location Assignments (with isPrimary)
//
// Resolves: gabinet_employees (by user_id) → gabinet_employee_locations
// Used by GabinetLocationContext to determine the user's accessible locations
// and which one carries the isPrimary flag for default selection.
// ---------------------------------------------------------------------------

export interface MyGabinetEmployeeLocation {
  locationId: string;
  isPrimary: boolean;
}

interface UseSupabaseMyGabinetEmployeeLocationsOptions {
  enabled?: boolean;
}

export function useSupabaseMyGabinetEmployeeLocations(
  organizationId: string,
  userId: string | null | undefined,
  options: UseSupabaseMyGabinetEmployeeLocationsOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MyGabinetEmployeeLocation[], Error>({
    queryKey: [
      "supabase",
      "gabinetMyEmployeeLocations",
      "list",
      organizationId,
      userId ?? "",
    ],
    queryFn: async (): Promise<MyGabinetEmployeeLocation[]> => {
      if (!client) throw new Error("Supabase client not ready");
      if (!userId) return [];

      const { data: employees, error: empError } = await client
        .from("gabinet_employees")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("user_id", userId);
      if (empError) throw empError;
      if (!employees || employees.length === 0) return [];

      const { data: assignments, error: asgError } = await client
        .from("gabinet_employee_locations")
        .select("location_id, is_primary")
        .eq("organization_id", organizationId)
        .in(
          "employee_id",
          employees.map((e) => e.id),
        );
      if (asgError) throw asgError;

      return (assignments ?? []).map((a) => ({
        locationId: a.location_id,
        isPrimary: a.is_primary,
      }));
    },
    enabled: enabled && isReady && !!organizationId && !!userId,
  } satisfies UseQueryOptions<MyGabinetEmployeeLocation[], Error>);
}

// ---------------------------------------------------------------------------
// Single Location with Rooms
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetLocationOptions {
  enabled?: boolean;
}

export function useSupabaseGabinetLocation(
  organizationId: string,
  locationId: string | null | undefined,
  options: UseSupabaseGabinetLocationOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedGabinetLocationWithRooms | null, Error>({
    queryKey: [
      ...supabaseKeys.gabinetLocations.detail(organizationId, locationId ?? ""),
      "with-rooms",
    ],
    queryFn: async (): Promise<MappedGabinetLocationWithRooms | null> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data: locationData, error: locationError } = await client
        .from("gabinet_locations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", locationId!)
        .maybeSingle();

      if (locationError) throw locationError;
      if (!locationData) return null;

      const { data: roomsData, error: roomsError } = await client
        .from("gabinet_rooms")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("location_id", locationId!)
        .order("name", { ascending: true });

      if (roomsError) throw roomsError;

      return {
        ...mapGabinetLocationFromSupabase(locationData),
        rooms: (roomsData ?? []).map(mapGabinetRoomFromSupabase),
      };
    },
    enabled: enabled && isReady && !!organizationId && !!locationId,
  } satisfies UseQueryOptions<MappedGabinetLocationWithRooms | null, Error>);
}
