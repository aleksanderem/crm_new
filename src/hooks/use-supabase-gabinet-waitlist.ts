/**
 * React Query hooks for fetching gabinet waitlist entries from Supabase.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import type { GabinetWaitlistRow } from "@/lib/supabase/database.types";

// ---------------------------------------------------------------------------
// Waitlist by Organisation
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetWaitlistOptions {
  enabled?: boolean;
  status?: string;
}

export function useSupabaseGabinetWaitlist(
  organizationId: string,
  options: UseSupabaseGabinetWaitlistOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, status } = options;

  return useQuery<GabinetWaitlistRow[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetWaitlist.list(organizationId),
      ...(status ? [status] : []),
    ],
    queryFn: async (): Promise<GabinetWaitlistRow[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let q = client
        .from("gabinet_waitlist")
        .select("*")
        .eq("organization_id", organizationId);

      if (status) {
        q = q.eq("status", status);
      }

      const { data, error } = await q.order("priority", { ascending: true }).order("created_at", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<GabinetWaitlistRow[], Error>);
}

// ---------------------------------------------------------------------------
// Waitlist for a specific patient
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetWaitlistForPatientOptions {
  enabled?: boolean;
}

export function useSupabaseGabinetWaitlistForPatient(
  organizationId: string,
  patientId: string | undefined,
  options: UseSupabaseGabinetWaitlistForPatientOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<GabinetWaitlistRow[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetWaitlist.list(organizationId),
      "byPatient",
      patientId ?? "",
    ],
    queryFn: async (): Promise<GabinetWaitlistRow[]> => {
      if (!client || !patientId) return [];

      const { data, error } = await client
        .from("gabinet_waitlist")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: enabled && isReady && !!organizationId && !!patientId,
  } satisfies UseQueryOptions<GabinetWaitlistRow[], Error>);
}
