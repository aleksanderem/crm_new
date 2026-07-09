/**
 * React Query hooks for fetching gabinet treatments from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetTreatmentFromSupabase,
  type MappedGabinetTreatment,
} from "@/lib/supabase/mappers/gabinet/treatments";
import {
  mapGabinetTreatmentVariantFromSupabase,
  type MappedGabinetTreatmentVariant,
} from "@/lib/supabase/mappers/gabinet/treatment-variants";

// ---------------------------------------------------------------------------
// Treatments List
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetTreatmentsListOptions {
  enabled?: boolean;
  limit?: number;
  sortOrder?: "asc" | "desc";
}

export function useSupabaseGabinetTreatmentsList(
  organizationId: string,
  options: UseSupabaseGabinetTreatmentsListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100, sortOrder = "desc" } = options;

  return useQuery<MappedGabinetTreatment[], Error>({
    queryKey: supabaseKeys.gabinetTreatments.list(organizationId),
    queryFn: async (): Promise<MappedGabinetTreatment[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("gabinet_treatments")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: sortOrder === "asc" })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetTreatmentFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetTreatment[], Error>);
}

// ---------------------------------------------------------------------------
// Single Treatment
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetTreatmentOptions {
  enabled?: boolean;
}

export function useSupabaseGabinetTreatment(
  organizationId: string,
  treatmentId: string | undefined,
  options: UseSupabaseGabinetTreatmentOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedGabinetTreatment | null, Error>({
    queryKey: supabaseKeys.gabinetTreatments.detail(
      organizationId,
      treatmentId ?? "",
    ),
    queryFn: async (): Promise<MappedGabinetTreatment | null> => {
      if (!client || !treatmentId) return null;

      const { data, error } = await client
        .from("gabinet_treatments")
        .select("*")
        .eq("id", treatmentId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapGabinetTreatmentFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId && !!treatmentId,
  } satisfies UseQueryOptions<MappedGabinetTreatment | null, Error>);
}

// ---------------------------------------------------------------------------
// Treatment Variants (by treatment ID)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// All Treatment Variants for Org (for building lookup maps)
// ---------------------------------------------------------------------------

export function useSupabaseGabinetAllTreatmentVariants(
  organizationId: string,
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedGabinetTreatmentVariant[], Error>({
    queryKey: supabaseKeys.gabinetTreatmentVariants.list(organizationId),
    queryFn: async (): Promise<MappedGabinetTreatmentVariant[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("gabinet_treatment_variants")
        .select("*")
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapGabinetTreatmentVariantFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetTreatmentVariant[], Error>);
}

interface UseSupabaseGabinetTreatmentVariantsOptions {
  enabled?: boolean;
  limit?: number;
}

export function useSupabaseGabinetTreatmentVariants(
  organizationId: string,
  treatmentId: string | undefined,
  options: UseSupabaseGabinetTreatmentVariantsOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100 } = options;

  return useQuery<MappedGabinetTreatmentVariant[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetTreatmentVariants.list(organizationId),
      treatmentId ?? "",
    ],
    queryFn: async (): Promise<MappedGabinetTreatmentVariant[]> => {
      if (!client || !treatmentId) return [];

      const { data, error } = await client
        .from("gabinet_treatment_variants")
        .select("*")
        .eq("treatment_id", treatmentId)
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetTreatmentVariantFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!treatmentId,
  } satisfies UseQueryOptions<MappedGabinetTreatmentVariant[], Error>);
}
