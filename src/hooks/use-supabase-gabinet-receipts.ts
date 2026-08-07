/**
 * React Query hooks for fetching gabinet_receipts from Supabase.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetReceiptFromSupabase,
  type MappedGabinetReceipt,
} from "@/lib/supabase/mappers/gabinet/receipts";

export function useSupabaseGabinetReceiptsByPatient(
  organizationId: string,
  patientId: string | undefined,
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedGabinetReceipt[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetReceipts.list(organizationId),
      "byPatient",
      patientId ?? "",
    ],
    queryFn: async (): Promise<MappedGabinetReceipt[]> => {
      if (!client || !patientId) return [];

      const { data, error } = await client
        .from("gabinet_receipts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("patient_id", patientId)
        .order("issued_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map(mapGabinetReceiptFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!patientId,
  } satisfies UseQueryOptions<MappedGabinetReceipt[], Error>);
}
