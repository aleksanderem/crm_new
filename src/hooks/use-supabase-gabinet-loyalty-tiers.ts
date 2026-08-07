/**
 * React Query hooks for fetching gabinet loyalty tiers from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import type { GabinetLoyaltyTierRow } from "@/lib/supabase/database.types";

// ---------------------------------------------------------------------------
// Loyalty Tiers List
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetLoyaltyTiersListOptions {
  enabled?: boolean;
}

export function useSupabaseGabinetLoyaltyTiersList(
  organizationId: string,
  options: UseSupabaseGabinetLoyaltyTiersListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<GabinetLoyaltyTierRow[], Error>({
    queryKey: supabaseKeys.gabinetLoyaltyTiers.list(organizationId),
    queryFn: async (): Promise<GabinetLoyaltyTierRow[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("gabinet_loyalty_tiers")
        .select("*")
        .eq("organization_id", organizationId)
        .order("threshold", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<GabinetLoyaltyTierRow[], Error>);
}
