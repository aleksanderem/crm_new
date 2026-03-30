/**
 * React Query hooks for fetching recently viewed items from Supabase.
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapRecentlyViewedFromSupabase, type MappedRecentlyViewed } from "@/lib/supabase/mappers";

export function useSupabaseRecentlyViewed(
  organizationId: string,
  userId: string,
  options?: { enabled?: boolean; entityType?: string; limit?: number },
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, entityType, limit = 10 } = options ?? {};

  return useQuery<MappedRecentlyViewed[], Error>({
    queryKey: [...supabaseKeys.recentlyViewed.list(organizationId), userId, entityType ?? "all"],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("recently_viewed")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("user_id", userId);

      if (entityType) query = query.eq("entity_type", entityType);

      const { data, error } = await query
        .order("viewed_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapRecentlyViewedFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!userId,
  });
}
