/**
 * React Query hooks for fetching gabinet employees from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetEmployeeFromSupabase,
  type MappedGabinetEmployee,
} from "@/lib/supabase/mappers/gabinet/employees";

// ---------------------------------------------------------------------------
// Employees List
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetEmployeesListOptions {
  enabled?: boolean;
  limit?: number;
  activeOnly?: boolean;
  sortOrder?: "asc" | "desc";
  locationId?: string | null;
}

export function useSupabaseGabinetEmployeesList(
  organizationId: string,
  options: UseSupabaseGabinetEmployeesListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const {
    enabled = true,
    limit = 100,
    activeOnly,
    sortOrder = "desc",
    locationId,
  } = options;

  return useQuery<MappedGabinetEmployee[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetEmployees.list(organizationId),
      activeOnly ?? "all",
      locationId ?? "all",
    ],
    queryFn: async (): Promise<MappedGabinetEmployee[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_employees")
        .select(
          locationId
            ? "*, gabinet_employee_locations!inner(location_id)"
            : "*",
        )
        .eq("organization_id", organizationId);

      if (locationId) {
        query = query.eq("gabinet_employee_locations.location_id", locationId);
      }

      if (activeOnly !== undefined) {
        query = query.eq("is_active", activeOnly);
      }

      const { data, error } = await query
        .order("created_at", { ascending: sortOrder === "asc" })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetEmployeeFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetEmployee[], Error>);
}

// ---------------------------------------------------------------------------
// Single Employee
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetEmployeeOptions {
  enabled?: boolean;
}

export function useSupabaseGabinetEmployee(
  organizationId: string,
  employeeId: string | undefined,
  options: UseSupabaseGabinetEmployeeOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedGabinetEmployee | null, Error>({
    queryKey: supabaseKeys.gabinetEmployees.detail(
      organizationId,
      employeeId ?? "",
    ),
    queryFn: async (): Promise<MappedGabinetEmployee | null> => {
      if (!client || !employeeId) return null;

      const { data, error } = await client
        .from("gabinet_employees")
        .select("*")
        .eq("id", employeeId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapGabinetEmployeeFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId && !!employeeId,
  } satisfies UseQueryOptions<MappedGabinetEmployee | null, Error>);
}
