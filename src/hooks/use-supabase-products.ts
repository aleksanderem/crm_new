/**
 * React Query hooks for fetching products from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapProductFromSupabase, type MappedProduct } from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Products List
// ---------------------------------------------------------------------------

interface UseSupabaseProductsListOptions {
  enabled?: boolean;
  limit?: number;
  search?: string;
  sortOrder?: "asc" | "desc";
}

export function useSupabaseProductsList(
  organizationId: string,
  options: UseSupabaseProductsListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100, search, sortOrder = "desc" } = options;

  return useQuery<MappedProduct[], Error>({
    queryKey: [...supabaseKeys.products.list(organizationId), search ?? ""],
    queryFn: async (): Promise<MappedProduct[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("products")
        .select("*")
        .eq("organization_id", organizationId);

      if (search?.trim()) {
        query = query.textSearch("search_vector", search.trim(), {
          type: "websearch",
          config: "simple",
        });
      }

      const { data, error } = await query
        .order("created_at", { ascending: sortOrder === "asc" })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapProductFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedProduct[], Error>);
}
