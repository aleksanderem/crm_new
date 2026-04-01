/**
 * React Query hooks for fetching gabinet treatment packages and package usage
 * from Supabase.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetTreatmentPackageFromSupabase,
  type MappedGabinetTreatmentPackage,
} from "@/lib/supabase/mappers/gabinet/treatment-packages";
import {
  mapGabinetPackageUsageFromSupabase,
  type MappedGabinetPackageUsage,
} from "@/lib/supabase/mappers/gabinet/package-usage";

// ---------------------------------------------------------------------------
// Treatment Packages — All
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetTreatmentPackagesListOptions {
  enabled?: boolean;
}

export function useSupabaseGabinetTreatmentPackagesList(
  organizationId: string,
  options: UseSupabaseGabinetTreatmentPackagesListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedGabinetTreatmentPackage[], Error>({
    queryKey: supabaseKeys.gabinetTreatmentPackages.list(organizationId),
    queryFn: async (): Promise<MappedGabinetTreatmentPackage[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("gabinet_treatment_packages")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map(mapGabinetTreatmentPackageFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetTreatmentPackage[], Error>);
}

// ---------------------------------------------------------------------------
// Treatment Packages — Active Only
// ---------------------------------------------------------------------------

export function useSupabaseGabinetTreatmentPackagesActive(
  organizationId: string,
  options: UseSupabaseGabinetTreatmentPackagesListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedGabinetTreatmentPackage[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetTreatmentPackages.list(organizationId),
      "active",
    ],
    queryFn: async (): Promise<MappedGabinetTreatmentPackage[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("gabinet_treatment_packages")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapGabinetTreatmentPackageFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetTreatmentPackage[], Error>);
}

// ---------------------------------------------------------------------------
// Package Usage — By Patient
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetPackageUsageByPatientOptions {
  enabled?: boolean;
}

export function useSupabaseGabinetPackageUsageByPatient(
  organizationId: string,
  patientId: string | undefined,
  options: UseSupabaseGabinetPackageUsageByPatientOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedGabinetPackageUsage[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetPackageUsage.list(organizationId),
      "byPatient",
      patientId ?? "",
    ],
    queryFn: async (): Promise<MappedGabinetPackageUsage[]> => {
      if (!client || !patientId) return [];

      const { data, error } = await client
        .from("gabinet_package_usage")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("patient_id", patientId)
        .order("purchased_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map(mapGabinetPackageUsageFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!patientId,
  } satisfies UseQueryOptions<MappedGabinetPackageUsage[], Error>);
}

// ---------------------------------------------------------------------------
// Package Usage — Active (org-wide, for stats)
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetPackageUsageActiveOptions {
  enabled?: boolean;
}

export function useSupabaseGabinetPackageUsageActive(
  organizationId: string,
  options: UseSupabaseGabinetPackageUsageActiveOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedGabinetPackageUsage[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetPackageUsage.list(organizationId),
      "active",
    ],
    queryFn: async (): Promise<MappedGabinetPackageUsage[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("gabinet_package_usage")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .order("purchased_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map(mapGabinetPackageUsageFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetPackageUsage[], Error>);
}
