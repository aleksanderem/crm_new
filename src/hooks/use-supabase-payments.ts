/**
 * React Query hooks for fetching payments from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapPaymentFromSupabase,
  type MappedPayment,
} from "@/lib/supabase/mappers/payments";

// ---------------------------------------------------------------------------
// Gratis/Barter Appointment ID Set (for turnover exclusion)
// ---------------------------------------------------------------------------

/**
 * Returns the set of appointment IDs in `appointmentIds` that have at least
 * one completed payment with payment_method in ('gratis', 'barter').
 * Used by the reports page to exclude those appointments from turnover totals
 * (migration 00023 deferred this application-layer rule to here).
 */
export function useSupabaseGratisBarterAppointmentIds(
  organizationId: string,
  appointmentIds: string[],
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  const stableIds = [...appointmentIds].sort();

  return useQuery<Set<string>, Error>({
    queryKey: [
      ...supabaseKeys.payments.list(organizationId),
      "gratisBarterAppointmentIds",
      stableIds.join(","),
    ],
    queryFn: async (): Promise<Set<string>> => {
      const result = new Set<string>();
      if (!client) throw new Error("Supabase client not ready");
      if (stableIds.length === 0) return result;

      const { data, error } = await client
        .from("payments")
        .select("appointment_id")
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .in("payment_method", ["gratis", "barter"])
        .in("appointment_id", stableIds);

      if (error) throw error;

      for (const row of (data ?? []) as { appointment_id: string | null }[]) {
        if (row.appointment_id) result.add(row.appointment_id);
      }
      return result;
    },
    enabled: enabled && isReady && !!organizationId && stableIds.length > 0,
  } satisfies UseQueryOptions<Set<string>, Error>);
}

// ---------------------------------------------------------------------------
// Patient Credit Balances (bulk)
// ---------------------------------------------------------------------------

/**
 * For a given set of patient IDs, returns each patient's available credit
 * balance derived from the payments ledger (issue #1059):
 *   balance = SUM(coalesce(credit_earned, 0) - coalesce(credit_applied, 0))
 * over completed payments. Returned map only contains patients with a strictly
 * positive balance — patients with zero or negative balance are omitted so the
 * caller can `has()` to drive an indicator.
 *
 * Powers the calendar's "Saldo +X" tile indicator (issue #1286).
 */
export function useSupabaseGabinetPatientCreditBalances(
  organizationId: string,
  patientIds: string[],
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  const stableIds = [...patientIds].sort();

  return useQuery<Map<string, number>, Error>({
    queryKey: [
      ...supabaseKeys.payments.list(organizationId),
      "creditBalancesByPatient",
      stableIds.join(","),
    ],
    queryFn: async (): Promise<Map<string, number>> => {
      const result = new Map<string, number>();
      if (!client) throw new Error("Supabase client not ready");
      if (stableIds.length === 0) return result;

      const { data, error } = await client
        .from("payments")
        .select("patient_id, credit_earned, credit_applied")
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .in("patient_id", stableIds);

      if (error) throw error;

      const sums = new Map<string, number>();
      for (const row of (data ?? []) as {
        patient_id: string | null;
        credit_earned: number | null;
        credit_applied: number | null;
      }[]) {
        if (!row.patient_id) continue;
        const delta =
          (Number(row.credit_earned) || 0) -
          (Number(row.credit_applied) || 0);
        sums.set(row.patient_id, (sums.get(row.patient_id) ?? 0) + delta);
      }
      for (const [pid, bal] of sums) {
        const rounded = Math.round(bal * 100) / 100;
        if (rounded > 0) result.set(pid, rounded);
      }
      return result;
    },
    enabled:
      enabled && isReady && !!organizationId && stableIds.length > 0,
  } satisfies UseQueryOptions<Map<string, number>, Error>);
}

// ---------------------------------------------------------------------------
// Payments Revenue by Date Range (for reports)
// ---------------------------------------------------------------------------

export interface PaymentRevenueSummary {
  amount: number;
  paidAt: number;
  currency: string;
}

/**
 * Returns completed non-gratis/barter payments within a date range, used by
 * the gabinet reports page to show actual collected revenue alongside the
 * appointment-based estimate. Only payments with a non-null `paid_at` are
 * included; `paid_at` timestamps are compared as milliseconds UTC.
 */
export function useSupabasePaymentsRevenueByDateRange(
  organizationId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<PaymentRevenueSummary[], Error>({
    queryKey: [
      ...supabaseKeys.payments.list(organizationId),
      "revenueByDateRange",
      startDate,
      endDate,
    ],
    queryFn: async (): Promise<PaymentRevenueSummary[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const startTs = new Date(startDate + "T00:00:00.000Z").getTime();
      const endTs = new Date(endDate + "T23:59:59.999Z").getTime();

      const { data, error } = await client
        .from("payments")
        .select("amount, paid_at, currency")
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .neq("payment_method", "gratis")
        .neq("payment_method", "barter")
        .not("paid_at", "is", null)
        .gte("paid_at", startTs)
        .lte("paid_at", endTs);

      if (error) throw error;

      return (data ?? []).map((row) => ({
        amount: Number(row.amount),
        paidAt: Number(row.paid_at ?? 0),
        currency: (row.currency as string) ?? "PLN",
      }));
    },
    enabled: enabled && isReady && !!organizationId && !!startDate && !!endDate,
  } satisfies UseQueryOptions<PaymentRevenueSummary[], Error>);
}

// ---------------------------------------------------------------------------
// Payments by Patient
// ---------------------------------------------------------------------------

interface UseSupabasePaymentsByPatientOptions {
  enabled?: boolean;
  limit?: number;
}

/**
 * Fetches all payments for a given patient, ordered by most recent first.
 * Used by the patient detail page Payments tab to show payment history.
 */
export function useSupabasePaymentsByPatient(
  organizationId: string,
  patientId: string | undefined,
  options: UseSupabasePaymentsByPatientOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100 } = options;

  return useQuery<MappedPayment[], Error>({
    queryKey: [
      ...supabaseKeys.payments.list(organizationId),
      "byPatient",
      patientId ?? "",
    ],
    queryFn: async (): Promise<MappedPayment[]> => {
      if (!client || !patientId) return [];

      const { data, error } = await client
        .from("payments")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapPaymentFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!patientId,
  } satisfies UseQueryOptions<MappedPayment[], Error>);
}
