/**
 * React Query hooks for the Gabinet end-of-day cash register feature (issue #4156).
 * Reads gabinet_cash_transactions and gabinet_day_closes via the Supabase RLS client.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GabinetCashTransaction {
  id: string;
  organizationId: string;
  locationId: string | null;
  date: string;
  type: "deposit" | "withdrawal";
  amount: number;
  reason: string | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface GabinetDayClose {
  id: string;
  organizationId: string;
  locationId: string | null;
  date: string;
  paymentSummary: Record<string, number>;
  totalCollected: number;
  cashFromPayments: number;
  cashOpeningBalance: number;
  cashDeposits: number;
  cashWithdrawals: number;
  cashExpected: number;
  cashCounted: number;
  cashDiscrepancy: number;
  notes: string | null;
  closedBy: string;
  closedAt: number;
  createdAt: number;
  updatedAt: number;
}

function mapCashTransaction(row: Record<string, unknown>): GabinetCashTransaction {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    locationId: (row.location_id as string | null) ?? null,
    date: row.date as string,
    type: row.type as "deposit" | "withdrawal",
    amount: Number(row.amount),
    reason: (row.reason as string | null) ?? null,
    createdBy: row.created_by as string,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapDayClose(row: Record<string, unknown>): GabinetDayClose {
  let paymentSummary: Record<string, number> = {};
  const raw = row.payment_summary;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    paymentSummary = raw as Record<string, number>;
  }
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    locationId: (row.location_id as string | null) ?? null,
    date: row.date as string,
    paymentSummary,
    totalCollected: Number(row.total_collected),
    cashFromPayments: Number(row.cash_from_payments),
    cashOpeningBalance: Number(row.cash_opening_balance),
    cashDeposits: Number(row.cash_deposits),
    cashWithdrawals: Number(row.cash_withdrawals),
    cashExpected: Number(row.cash_expected),
    cashCounted: Number(row.cash_counted),
    cashDiscrepancy: Number(row.cash_discrepancy),
    notes: (row.notes as string | null) ?? null,
    closedBy: row.closed_by as string,
    closedAt: Number(row.closed_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Cash Transactions for a specific date
// ---------------------------------------------------------------------------

export function useSupabaseGabinetCashTransactions(
  organizationId: string,
  date: string,
  options: { enabled?: boolean; locationId?: string } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, locationId } = options;

  return useQuery<GabinetCashTransaction[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetCashTransactions.list(organizationId),
      date,
      locationId ?? "",
    ],
    queryFn: async (): Promise<GabinetCashTransaction[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let q = client
        .from("gabinet_cash_transactions")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("date", date)
        .order("created_at", { ascending: true });

      if (locationId) q = q.eq("location_id", locationId);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => mapCashTransaction(r as Record<string, unknown>));
    },
    enabled: enabled && isReady && !!organizationId && !!date,
  } satisfies UseQueryOptions<GabinetCashTransaction[], Error>);
}

// ---------------------------------------------------------------------------
// Day Close for a specific date
// ---------------------------------------------------------------------------

export function useSupabaseGabinetDayCloseByDate(
  organizationId: string,
  date: string,
  options: { enabled?: boolean; locationId?: string } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, locationId } = options;

  return useQuery<GabinetDayClose | null, Error>({
    queryKey: [
      ...supabaseKeys.gabinetDayCloses.list(organizationId),
      "byDate",
      date,
      locationId ?? "",
    ],
    queryFn: async (): Promise<GabinetDayClose | null> => {
      if (!client) throw new Error("Supabase client not ready");

      let q = client
        .from("gabinet_day_closes")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("date", date);

      if (locationId) {
        q = q.eq("location_id", locationId);
      } else {
        q = q.is("location_id", null);
      }

      const { data, error } = await q.limit(1).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapDayClose(data as Record<string, unknown>);
    },
    enabled: enabled && isReady && !!organizationId && !!date,
  } satisfies UseQueryOptions<GabinetDayClose | null, Error>);
}

// ---------------------------------------------------------------------------
// Recent Day Closes list
// ---------------------------------------------------------------------------

export function useSupabaseGabinetDayClosesList(
  organizationId: string,
  options: { enabled?: boolean; locationId?: string; limit?: number } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, locationId, limit = 30 } = options;

  return useQuery<GabinetDayClose[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetDayCloses.list(organizationId),
      "history",
      locationId ?? "",
    ],
    queryFn: async (): Promise<GabinetDayClose[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let q = client
        .from("gabinet_day_closes")
        .select("*")
        .eq("organization_id", organizationId)
        .order("date", { ascending: false })
        .limit(limit);

      if (locationId) q = q.eq("location_id", locationId);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => mapDayClose(r as Record<string, unknown>));
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<GabinetDayClose[], Error>);
}
