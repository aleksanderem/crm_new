/**
 * React Query hooks for fetching products from Supabase (PostgreSQL).
 */

export type StockMovementReason =
  | "initial"
  | "warehouse_receive"
  | "manual_adjust"
  | "inventory_adjustment"
  | "appointment_use"
  | "appointment_return"
  | "deal_close"
  | "deal_reopen"
  | "transfer_in"
  | "transfer_out"
  | "other";

export interface MappedStockMovement {
  _id: string;
  organizationId: string;
  productId: string;
  locationId: string | null;
  delta: number;
  balanceAfter: number | null;
  reason: StockMovementReason;
  sourceType: string | null;
  sourceId: string | null;
  note: string | null;
  performedBy: string;
  performedByName?: string;
  createdAt: number;
}

import { useMemo } from "react";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapProductFromSupabase, type MappedProduct } from "@/lib/supabase/mappers";
import type { Database } from "@/lib/supabase/database.types";

// ---------------------------------------------------------------------------
// Products List
// ---------------------------------------------------------------------------

interface UseSupabaseProductsListOptions {
  enabled?: boolean;
  limit?: number;
  search?: string;
  sortOrder?: "asc" | "desc";
  productSection?: string;
}

export function useSupabaseProductsList(
  organizationId: string,
  options: UseSupabaseProductsListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100, search, sortOrder = "desc", productSection } = options;

  return useQuery<MappedProduct[], Error>({
    queryKey: [...supabaseKeys.products.list(organizationId), search ?? "", productSection ?? ""],
    queryFn: async (): Promise<MappedProduct[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("products")
        .select("*")
        .eq("organization_id", organizationId);

      if (productSection) {
        query = query.eq("product_section", productSection);
      }

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
  byLocation: Array<{ locationId: string | null; quantity: number; avgCost: number | null }>;
}

export function useSupabaseProductStockTotals(
  organizationId: string,
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  const query = useQuery<
    Array<{ product_id: string; location_id: string | null; quantity: number; avg_cost: number | null }>,
    Error
  >({
    queryKey: supabaseKeys.productStockLevels.list(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");
      const { data, error } = await client
        .from("product_stock_levels")
        .select("product_id, location_id, quantity, avg_cost")
        .eq("organization_id", organizationId);
      if (error) throw error;
      return (data ?? []) as Array<{
        product_id: string;
        location_id: string | null;
        quantity: number;
        avg_cost: number | null;
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
        avgCost: row.avg_cost != null ? Number(row.avg_cost) : null,
      });
      map.set(row.product_id, existing);
    }
    return map;
  }, [query.data]);

  return { ...query, totalsByProductId };
}

// ---------------------------------------------------------------------------
// Product Stock Movements (#2056 — warehouse receiving MVP)
//
// Fetches the movement history for a single product, ordered newest-first.
// Joins the users table so performer names are available without a second query.
// ---------------------------------------------------------------------------

export function useSupabaseProductStockMovements(
  organizationId: string,
  productId: string | null,
  options: { enabled?: boolean; limit?: number } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100 } = options;

  return useQuery<MappedStockMovement[], Error>({
    queryKey: [
      ...supabaseKeys.productStockMovements.list(organizationId),
      productId ?? "",
    ],
    queryFn: async (): Promise<MappedStockMovement[]> => {
      if (!client || !productId) return [];

      const { data, error } = await client
        .from("product_stock_movements")
        .select(
          `id, organization_id, product_id, location_id, delta, balance_after, reason, source_type, source_id, note, performed_by, created_at,
           users:users!product_stock_movements_performed_by_fkey (id, name, email)`,
        )
        .eq("organization_id", organizationId)
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      type StockMovementRow = Database["public"]["Tables"]["product_stock_movements"]["Row"] & {
        users: { id: string; name?: string | null; email?: string | null } | null;
      };
      return ((data ?? []) as StockMovementRow[]).map((row) => {
        const user = row.users;
        return {
          _id: row.id,
          organizationId: row.organization_id,
          productId: row.product_id,
          locationId: row.location_id,
          delta: Number(row.delta),
          balanceAfter: row.balance_after != null ? Number(row.balance_after) : null,
          reason: row.reason as StockMovementReason,
          sourceType: row.source_type,
          sourceId: row.source_id,
          note: row.note,
          performedBy: row.performed_by,
          performedByName: user?.name ?? user?.email ?? undefined,
          createdAt: Number(row.created_at),
        };
      });
    },
    enabled: enabled && isReady && !!organizationId && !!productId,
  });
}
