/**
 * React Query hooks for fetching payments from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapPaymentFromSupabase,
  type MappedPayment,
} from "@/lib/supabase/mappers/payments";

// ---------------------------------------------------------------------------
// Payments by Patient
// ---------------------------------------------------------------------------

interface UseSupabasePaymentsByPatientOptions {
  enabled?: boolean;
  limit?: number;
}

/**
 * Fetches all payments for a given patient, ordered by most recent first.
 * Used by the patient detail page Payments tab to show payment history.
 */
export function useSupabasePaymentsByPatient(
  organizationId: string,
  patientId: string | undefined,
  options: UseSupabasePaymentsByPatientOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100 } = options;

  return useQuery<MappedPayment[], Error>({
    queryKey: [
      ...supabaseKeys.payments.list(organizationId),
      "byPatient",
      patientId ?? "",
    ],
    queryFn: async (): Promise<MappedPayment[]> => {
      if (!client || !patientId) return [];

      const { data, error } = await client
        .from("payments")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapPaymentFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!patientId,
  } satisfies UseQueryOptions<MappedPayment[], Error>);
}
