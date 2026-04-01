/**
 * React Query hooks for fetching gabinet loyalty points and transactions
 * from Supabase.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetLoyaltyPointsFromSupabase,
  type MappedGabinetLoyaltyPoints,
} from "@/lib/supabase/mappers/gabinet/loyalty-points";
import {
  mapGabinetLoyaltyTransactionFromSupabase,
  type MappedGabinetLoyaltyTransaction,
} from "@/lib/supabase/mappers/gabinet/loyalty-transactions";

// ---------------------------------------------------------------------------
// Loyalty Balance — Single patient
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetLoyaltyBalanceOptions {
  enabled?: boolean;
}

export function useSupabaseGabinetLoyaltyBalance(
  organizationId: string,
  patientId: string | undefined,
  options: UseSupabaseGabinetLoyaltyBalanceOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedGabinetLoyaltyPoints | null, Error>({
    queryKey: supabaseKeys.gabinetLoyaltyPoints.detail(
      organizationId,
      patientId ?? "",
    ),
    queryFn: async (): Promise<MappedGabinetLoyaltyPoints | null> => {
      if (!client || !patientId) return null;

      const { data, error } = await client
        .from("gabinet_loyalty_points")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("patient_id", patientId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapGabinetLoyaltyPointsFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId && !!patientId,
  } satisfies UseQueryOptions<MappedGabinetLoyaltyPoints | null, Error>);
}

// ---------------------------------------------------------------------------
// Loyalty Transactions — Patient history
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetLoyaltyTransactionsOptions {
  enabled?: boolean;
  limit?: number;
}

export function useSupabaseGabinetLoyaltyTransactions(
  organizationId: string,
  patientId: string | undefined,
  options: UseSupabaseGabinetLoyaltyTransactionsOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100 } = options;

  return useQuery<MappedGabinetLoyaltyTransaction[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetLoyaltyTransactions.list(organizationId),
      "byPatient",
      patientId ?? "",
    ],
    queryFn: async (): Promise<MappedGabinetLoyaltyTransaction[]> => {
      if (!client || !patientId) return [];

      const { data, error } = await client
        .from("gabinet_loyalty_transactions")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetLoyaltyTransactionFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!patientId,
  } satisfies UseQueryOptions<MappedGabinetLoyaltyTransaction[], Error>);
}
