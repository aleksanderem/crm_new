/**
 * React Query hooks for fetching gabinet patients from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetPatientFromSupabase,
  type MappedGabinetPatient,
} from "@/lib/supabase/mappers/gabinet/patients";

// ---------------------------------------------------------------------------
// Patients List
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetPatientsListOptions {
  enabled?: boolean;
  limit?: number;
  search?: string;
  sortOrder?: "asc" | "desc";
}

export function useSupabaseGabinetPatientsList(
  organizationId: string,
  options: UseSupabaseGabinetPatientsListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100, search, sortOrder = "desc" } = options;

  return useQuery<MappedGabinetPatient[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetPatients.list(organizationId),
      search ?? "",
    ],
    queryFn: async (): Promise<MappedGabinetPatient[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_patients")
        .select("*")
        .eq("organization_id", organizationId);

      if (search?.trim()) {
        // Each whitespace-separated token must match either first_name or
        // last_name. Chained .or() filters are AND-combined by PostgREST,
        // so "John Smith" becomes
        //   (first_name ILIKE %John% OR last_name ILIKE %John%)
        //   AND
        //   (first_name ILIKE %Smith% OR last_name ILIKE %Smith%)
        for (const token of search.trim().split(/\s+/)) {
          const pattern = `%${token}%`;
          query = query.or(
            `first_name.ilike.${pattern},last_name.ilike.${pattern}`,
          );
        }
      }

      const { data, error } = await query
        .order("created_at", { ascending: sortOrder === "asc" })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetPatientFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetPatient[], Error>);
}

// ---------------------------------------------------------------------------
// Single Patient
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetPatientOptions {
  enabled?: boolean;
}

export function useSupabaseGabinetPatient(
  organizationId: string,
  patientId: string | undefined,
  options: UseSupabaseGabinetPatientOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedGabinetPatient | null, Error>({
    queryKey: supabaseKeys.gabinetPatients.detail(
      organizationId,
      patientId ?? "",
    ),
    queryFn: async (): Promise<MappedGabinetPatient | null> => {
      if (!client || !patientId) return null;

      const { data, error } = await client
        .from("gabinet_patients")
        .select("*")
        .eq("id", patientId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapGabinetPatientFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId && !!patientId,
  } satisfies UseQueryOptions<MappedGabinetPatient | null, Error>);
}
