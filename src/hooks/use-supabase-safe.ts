/**
 * React Query hooks for reading Gabinet safe (Sejf) movements from Supabase.
 * Balance is always derived from the movement history — there is no separate
 * balance column (see migration 00145_gabinet_safe_movements.sql).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GabinetSafeMovement {
  id: string;
  organizationId: string;
  locationId: string;
  type: "transfer_in" | "withdrawal";
  amount: number;
  description: string | null;
  referenceDayCloseId: string | null;
  createdBy: string;
  createdAt: number;
}

export interface GabinetSafeData {
  movements: GabinetSafeMovement[];
  balance: number;
  totalIn: number;
  totalOut: number;
}

export interface GabinetSafeRangeData {
  movements: GabinetSafeMovement[];
  totalIn: number;
  totalOut: number;
}

function mapSafeMovement(row: Record<string, unknown>): GabinetSafeMovement {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    locationId: row.location_id as string,
    type: row.type as "transfer_in" | "withdrawal",
    amount: Number(row.amount),
    description: (row.description as string | null) ?? null,
    referenceDayCloseId: (row.reference_day_close_id as string | null) ?? null,
    createdBy: row.created_by as string,
    createdAt: Number(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// useSupabaseGabinetSafeMovementsInRange
// ---------------------------------------------------------------------------
// Returns safe movements for a specific location filtered by a date range.
// `created_at` is a Unix timestamp in milliseconds; the range is inclusive
// of the full start day and the full end day (local midnight boundaries).

export function useSupabaseGabinetSafeMovementsInRange(
  organizationId: string,
  locationId: string | undefined,
  startDate: string,
  endDate: string,
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<GabinetSafeRangeData, Error>({
    queryKey: [
      ...supabaseKeys.gabinetSafeMovements.list(organizationId),
      "range",
      locationId ?? "",
      startDate,
      endDate,
    ],
    queryFn: async (): Promise<GabinetSafeRangeData> => {
      if (!client) throw new Error("Supabase client not ready");
      if (!locationId) throw new Error("locationId is required");

      const startTs = new Date(`${startDate}T00:00:00`).getTime();
      const endTs = new Date(`${endDate}T23:59:59.999`).getTime();

      const { data, error } = await client
        .from("gabinet_safe_movements")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("location_id", locationId)
        .gte("created_at", startTs)
        .lte("created_at", endTs)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []).map((r: Record<string, unknown>) =>
        mapSafeMovement(r),
      );

      let totalIn = 0;
      let totalOut = 0;
      for (const m of rows) {
        if (m.type === "transfer_in") {
          totalIn = Math.round((totalIn + m.amount) * 100) / 100;
        } else {
          totalOut = Math.round((totalOut + m.amount) * 100) / 100;
        }
      }

      return { movements: rows, totalIn, totalOut };
    },
    enabled:
      enabled && isReady && !!organizationId && !!locationId && !!startDate && !!endDate,
  } satisfies UseQueryOptions<GabinetSafeRangeData, Error>);
}

// ---------------------------------------------------------------------------
// useSupabaseGabinetSafeMovements
// ---------------------------------------------------------------------------
// Returns the full safe data for a specific location:
//   - movement list (newest first)
//   - computed balance, totalIn, totalOut

export function useSupabaseGabinetSafeMovements(
  organizationId: string,
  locationId: string | undefined,
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<GabinetSafeData, Error>({
    queryKey: [
      ...supabaseKeys.gabinetSafeMovements.list(organizationId),
      locationId ?? "",
    ],
    queryFn: async (): Promise<GabinetSafeData> => {
      if (!client) throw new Error("Supabase client not ready");
      if (!locationId) throw new Error("locationId is required");

      const { data, error } = await client
        .from("gabinet_safe_movements")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("location_id", locationId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []).map((r: Record<string, unknown>) =>
        mapSafeMovement(r),
      );

      let totalIn = 0;
      let totalOut = 0;
      for (const m of rows) {
        if (m.type === "transfer_in") {
          totalIn = Math.round((totalIn + m.amount) * 100) / 100;
        } else {
          totalOut = Math.round((totalOut + m.amount) * 100) / 100;
        }
      }
      const balance = Math.round((totalIn - totalOut) * 100) / 100;

      return { movements: rows, balance, totalIn, totalOut };
    },
    enabled:
      enabled && isReady && !!organizationId && !!locationId,
  } satisfies UseQueryOptions<GabinetSafeData, Error>);
}
