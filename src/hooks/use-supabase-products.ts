/**
 * React Query hooks for fetching products from Supabase (PostgreSQL).
 */

import { useMemo } from "react";
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

// ---------------------------------------------------------------------------
// Used Product IDs (for nudge=unused filter)
// ---------------------------------------------------------------------------

/**
 * Returns the set of product IDs that appear in at least one deal_products row
 * for the given organization. The products index page uses the inverse set to
 * apply the `nudge=unused` filter (products NOT in this set are "unused").
 *
 * Mirrors the backend logic in convex/nudges.ts (getProductsNudges).
 */
export function useSupabaseUsedProductIds(
  organizationId: string,
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<Set<string>, Error>({
    queryKey: ["supabase", "dealProducts", "usedProductIds", organizationId],
    queryFn: async (): Promise<Set<string>> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("deal_products")
        .select("product_id")
        .eq("organization_id", organizationId);

      if (error) throw error;
      return new Set(
        ((data ?? []) as { product_id: string }[]).map((dp) => dp.product_id),
      );
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<Set<string>, Error>);
}

// ---------------------------------------------------------------------------
// Product Stock Totals (#1700 PR-A)
//
// Loads every product_stock_levels row for the org and returns a Map from
// productId → { total, byLocation }. The product list page consumes the
// total so it can render a Stock column next to each row without an
// N+1 lookup. Locations are surfaced too for the per-product detail panel.
// ---------------------------------------------------------------------------

export interface ProductStockTotal {
  total: number;
  byLocation: Array<{ locationId: string | null; quantity: number }>;
}

export function useSupabaseProductStockTotals(
  organizationId: string,
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  const query = useQuery<
    Array<{ product_id: string; location_id: string | null; quantity: number }>,
    Error
  >({
    queryKey: supabaseKeys.productStockLevels.list(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");
      const { data, error } = await client
        .from("product_stock_levels")
        .select("product_id, location_id, quantity")
        .eq("organization_id", organizationId);
      if (error) throw error;
      return (data ?? []) as Array<{
        product_id: string;
        location_id: string | null;
        quantity: number;
      }>;
    },
    enabled: enabled && isReady && !!organizationId,
  });

  const totalsByProductId = useMemo(() => {
    const map = new Map<string, ProductStockTotal>();
    for (const row of query.data ?? []) {
      const existing = map.get(row.product_id) ?? { total: 0, byLocation: [] };
      const qty = Number(row.quantity ?? 0);
      existing.total += qty;
      existing.byLocation.push({
        locationId: row.location_id,
        quantity: qty,
      });
      map.set(row.product_id, existing);
    }
    return map;
  }, [query.data]);

  return { ...query, totalsByProductId };
}
