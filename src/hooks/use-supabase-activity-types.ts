/**
 * React Query hooks for fetching activity types from Supabase.
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapActivityTypeFromSupabase, type MappedActivityType } from "@/lib/supabase/mappers";

export function useSupabaseActivityTypesList(organizationId: string, options?: { enabled?: boolean }) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<MappedActivityType[], Error>({
    queryKey: supabaseKeys.activityTypes.list(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("activity_type_definitions")
        .select("*")
        .eq("organization_id", organizationId)
        .order("order", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapActivityTypeFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}
