/**
 * React Query hooks for fetching gabinet appointments from Supabase (PostgreSQL).
 *
 * The date-range hook powers the calendar view. Appointment hooks support
 * filtering by patient, employee, and single-record detail.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetAppointmentFromSupabase,
  type MappedGabinetAppointment,
} from "@/lib/supabase/mappers/gabinet/appointments";

// ---------------------------------------------------------------------------
// Appointments by Date Range (calendar view)
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetAppointmentsByDateRangeOptions {
  enabled?: boolean;
  employeeId?: string;
  locationId?: string;
}

/**
 * Fetches appointments within a date range for an organization.
 * Supports optional employee and location filters.
 */
export function useSupabaseGabinetAppointmentsByDateRange(
  organizationId: string,
  startDate: string,
  endDate: string,
  options: UseSupabaseGabinetAppointmentsByDateRangeOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, employeeId, locationId } = options;

  return useQuery<MappedGabinetAppointment[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetAppointments.list(organizationId),
      "dateRange",
      startDate,
      endDate,
      employeeId ?? "",
      locationId ?? "",
    ],
    queryFn: async (): Promise<MappedGabinetAppointment[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_appointments")
        .select("*")
        .eq("organization_id", organizationId)
        .gte("date", startDate)
        .lte("date", endDate);

      if (employeeId) {
        query = query.eq("employee_id", employeeId);
      }
      if (locationId) {
        query = query.eq("location_id", locationId);
      }

      const { data, error } = await query.order("date").order("start_time");

      if (error) throw error;
      return (data ?? []).map(mapGabinetAppointmentFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!startDate && !!endDate,
  } satisfies UseQueryOptions<MappedGabinetAppointment[], Error>);
}

// ---------------------------------------------------------------------------
// Appointments by Patient
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetAppointmentsByPatientOptions {
  enabled?: boolean;
  limit?: number;
  locationId?: string;
}

export function useSupabaseGabinetAppointmentsByPatient(
  organizationId: string,
  patientId: string | undefined,
  options: UseSupabaseGabinetAppointmentsByPatientOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100, locationId } = options;

  return useQuery<MappedGabinetAppointment[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetAppointments.list(organizationId),
      "patient",
      patientId ?? "",
      locationId ?? "",
    ],
    queryFn: async (): Promise<MappedGabinetAppointment[]> => {
      if (!client || !patientId) return [];

      let query = client
        .from("gabinet_appointments")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("patient_id", patientId);

      if (locationId) {
        query = query.eq("location_id", locationId);
      }

      const { data, error } = await query
        .order("date", { ascending: false })
        .order("start_time", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetAppointmentFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!patientId,
  } satisfies UseQueryOptions<MappedGabinetAppointment[], Error>);
}

// ---------------------------------------------------------------------------
// Appointments by Employee
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetAppointmentsByEmployeeOptions {
  enabled?: boolean;
  limit?: number;
}

export function useSupabaseGabinetAppointmentsByEmployee(
  organizationId: string,
  employeeId: string | undefined,
  options: UseSupabaseGabinetAppointmentsByEmployeeOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100 } = options;

  return useQuery<MappedGabinetAppointment[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetAppointments.list(organizationId),
      "employee",
      employeeId ?? "",
    ],
    queryFn: async (): Promise<MappedGabinetAppointment[]> => {
      if (!client || !employeeId) return [];

      const { data, error } = await client
        .from("gabinet_appointments")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("employee_id", employeeId)
        .order("date", { ascending: false })
        .order("start_time", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetAppointmentFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!employeeId,
  } satisfies UseQueryOptions<MappedGabinetAppointment[], Error>);
}

// ---------------------------------------------------------------------------
// Recent Visit Patient IDs (for nudge filtering)
// ---------------------------------------------------------------------------

/**
 * Returns the set of patient IDs that have at least one non-cancelled,
 * non-no-show appointment within the last `days` days. Used by the patients
 * page to apply the `nudge=no-recent-visit` filter (the inverse — patients
 * NOT in this set have had no recent visit).
 *
 * Mirrors the backend logic in convex/gabinet/nudges.ts.
 */
export function useSupabaseGabinetRecentVisitPatientIds(
  organizationId: string,
  days: number = 90,
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<Set<string>, Error>({
    queryKey: [
      ...supabaseKeys.gabinetAppointments.list(organizationId),
      "recentVisitPatientIds",
      days,
    ],
    queryFn: async (): Promise<Set<string>> => {
      if (!client) throw new Error("Supabase client not ready");

      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const { data, error } = await client
        .from("gabinet_appointments")
        .select("patient_id")
        .eq("organization_id", organizationId)
        .gte("date", cutoff)
        .not("status", "in", '("cancelled","no_show")');

      if (error) throw error;
      return new Set(
        ((data ?? []) as { patient_id: string }[]).map((a) => a.patient_id),
      );
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<Set<string>, Error>);
}

// ---------------------------------------------------------------------------
// Earliest Appointment IDs per Patient (for first-visit indicator)
// ---------------------------------------------------------------------------

/**
 * For a given set of patient IDs, returns the IDs of the chronologically first
 * non-cancelled, non-no-show appointment for each patient. Used by the gabinet
 * calendar to render a "first visit" indicator on the appointment card.
 *
 * Disabled when `patientIds` is empty.
 */
export function useSupabaseGabinetFirstAppointmentIdsByPatient(
  organizationId: string,
  patientIds: string[],
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  const stableIds = [...patientIds].sort();

  return useQuery<Set<string>, Error>({
    queryKey: [
      ...supabaseKeys.gabinetAppointments.list(organizationId),
      "firstAppointmentIdsByPatient",
      stableIds.join(","),
    ],
    queryFn: async (): Promise<Set<string>> => {
      if (!client) throw new Error("Supabase client not ready");
      if (stableIds.length === 0) return new Set();

      const { data, error } = await client
        .from("gabinet_appointments")
        .select("id, patient_id, date, start_time")
        .eq("organization_id", organizationId)
        .in("patient_id", stableIds)
        .not("status", "in", '("cancelled","no_show")')
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) throw error;

      const firstIds = new Set<string>();
      const seen = new Set<string>();
      for (const row of (data ?? []) as {
        id: string;
        patient_id: string;
      }[]) {
        if (seen.has(row.patient_id)) continue;
        seen.add(row.patient_id);
        firstIds.add(row.id);
      }
      return firstIds;
    },
    enabled:
      enabled &&
      isReady &&
      !!organizationId &&
      stableIds.length > 0,
  } satisfies UseQueryOptions<Set<string>, Error>);
}

// ---------------------------------------------------------------------------
// Appointment Positions Within Package Usages
// ---------------------------------------------------------------------------

/**
 * Returns, for each appointment that belongs to one of the given package usage
 * records, its 1-based position among non-cancelled appointments sharing the
 * same package usage. Used by the gabinet calendar to render a "visit X / Y"
 * indicator for package-bound appointments.
 *
 * The total Y is computed by summing all `totalCount`/`totalAllowed` values
 * across the matching `gabinet_package_usage` row's `treatments_used` array.
 */
export interface AppointmentPackagePosition {
  position: number;
  total: number;
}

export function useSupabaseGabinetAppointmentPackagePositions(
  organizationId: string,
  packageUsageIds: string[],
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  const stableIds = [...packageUsageIds].sort();

  return useQuery<Map<string, AppointmentPackagePosition>, Error>({
    queryKey: [
      ...supabaseKeys.gabinetAppointments.list(organizationId),
      "packagePositions",
      stableIds.join(","),
    ],
    queryFn: async (): Promise<Map<string, AppointmentPackagePosition>> => {
      const result = new Map<string, AppointmentPackagePosition>();
      if (!client) throw new Error("Supabase client not ready");
      if (stableIds.length === 0) return result;

      const [usageRes, apptRes] = await Promise.all([
        client
          .from("gabinet_package_usage")
          .select("id, treatments_used")
          .eq("organization_id", organizationId)
          .in("id", stableIds),
        client
          .from("gabinet_appointments")
          .select("id, package_usage_id, date, start_time")
          .eq("organization_id", organizationId)
          .in("package_usage_id", stableIds)
          .not("status", "in", '("cancelled","no_show")')
          .order("date", { ascending: true })
          .order("start_time", { ascending: true }),
      ]);

      if (usageRes.error) throw usageRes.error;
      if (apptRes.error) throw apptRes.error;

      // Sum totals per package usage from the treatments_used JSONB.
      const totalsByUsage = new Map<string, number>();
      for (const u of (usageRes.data ?? []) as {
        id: string;
        treatments_used: unknown;
      }[]) {
        const entries = Array.isArray(u.treatments_used)
          ? (u.treatments_used as Array<{
              totalCount?: number;
              totalAllowed?: number;
            }>)
          : [];
        const total = entries.reduce(
          (s, e) => s + (Number(e.totalCount ?? e.totalAllowed ?? 0) || 0),
          0,
        );
        if (total > 0) totalsByUsage.set(u.id, total);
      }

      // Walk appointments in chronological order and assign positions.
      const counter = new Map<string, number>();
      for (const a of (apptRes.data ?? []) as {
        id: string;
        package_usage_id: string;
      }[]) {
        const total = totalsByUsage.get(a.package_usage_id);
        if (!total) continue;
        const next = (counter.get(a.package_usage_id) ?? 0) + 1;
        counter.set(a.package_usage_id, next);
        result.set(a.id, { position: next, total });
      }

      return result;
    },
    enabled:
      enabled &&
      isReady &&
      !!organizationId &&
      stableIds.length > 0,
  } satisfies UseQueryOptions<Map<string, AppointmentPackagePosition>, Error>);
}

// ---------------------------------------------------------------------------
// Appointment Positions Within Recurring Series
// ---------------------------------------------------------------------------

/**
 * Returns, for each appointment that belongs to one of the given recurring
 * groups, its 1-based position in chronological order among non-cancelled
 * siblings sharing the same `recurringGroupId`. Used by the gabinet calendar
 * so that the "visit X / Y" indicator reflects the actual order after a
 * recurring occurrence has been rescheduled — the stored `recurringIndex`
 * does not update on move (issue #1032).
 */
export function useSupabaseGabinetAppointmentRecurringPositions(
  organizationId: string,
  recurringGroupIds: string[],
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  const stableIds = [...recurringGroupIds].sort();

  return useQuery<Map<string, number>, Error>({
    queryKey: [
      ...supabaseKeys.gabinetAppointments.list(organizationId),
      "recurringPositions",
      stableIds.join(","),
    ],
    queryFn: async (): Promise<Map<string, number>> => {
      const result = new Map<string, number>();
      if (!client) throw new Error("Supabase client not ready");
      if (stableIds.length === 0) return result;

      const { data, error } = await client
        .from("gabinet_appointments")
        .select("id, recurring_group_id, date, start_time")
        .eq("organization_id", organizationId)
        .in("recurring_group_id", stableIds)
        .not("status", "in", '("cancelled","no_show")')
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) throw error;

      const counter = new Map<string, number>();
      for (const a of (data ?? []) as {
        id: string;
        recurring_group_id: string;
      }[]) {
        const next = (counter.get(a.recurring_group_id) ?? 0) + 1;
        counter.set(a.recurring_group_id, next);
        result.set(a.id, next);
      }

      return result;
    },
    enabled:
      enabled &&
      isReady &&
      !!organizationId &&
      stableIds.length > 0,
  } satisfies UseQueryOptions<Map<string, number>, Error>);
}

// ---------------------------------------------------------------------------
// Completed-payment Totals by Appointment
// ---------------------------------------------------------------------------

/**
 * Returns the sum of completed payments per appointment for the given IDs.
 * Used by the gabinet calendar to render a paid/partial/unpaid indicator on
 * each tile (issue #1040). Only payments with status="completed" count —
 * pending payments are auto-created at booking time and must not be treated
 * as actual receipts (mirrors `appointment-preview-content.tsx` logic).
 *
 * Credit applied from the patient's overpayment balance (`credit_applied`,
 * issue #1059) counts toward the paid total — a visit settled purely from
 * credit lands as `amount=0, credit_applied=price` (#1856), and must light
 * up the green "✓" indicator, not the red "!".
 *
 * Returned map keys are appointment IDs; values are the total in PLN.
 */
export function useSupabaseGabinetAppointmentPaymentTotals(
  organizationId: string,
  appointmentIds: string[],
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  const stableIds = [...appointmentIds].sort();

  return useQuery<Map<string, number>, Error>({
    queryKey: [
      ...supabaseKeys.payments.list(organizationId),
      "completedTotalsByAppointment",
      stableIds.join(","),
    ],
    queryFn: async (): Promise<Map<string, number>> => {
      const result = new Map<string, number>();
      if (!client) throw new Error("Supabase client not ready");
      if (stableIds.length === 0) return result;

      const { data, error } = await client
        .from("payments")
        .select("appointment_id, amount, credit_applied")
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .in("appointment_id", stableIds);

      if (error) throw error;

      for (const row of (data ?? []) as {
        appointment_id: string | null;
        amount: number;
        credit_applied: number | null;
      }[]) {
        if (!row.appointment_id) continue;
        const current = result.get(row.appointment_id) ?? 0;
        const contribution =
          (Number(row.amount) || 0) + (Number(row.credit_applied) || 0);
        result.set(row.appointment_id, current + contribution);
      }
      return result;
    },
    enabled:
      enabled && isReady && !!organizationId && stableIds.length > 0,
  } satisfies UseQueryOptions<Map<string, number>, Error>);
}

// ---------------------------------------------------------------------------
// Next Appointment per Patient (for patients table column)
// ---------------------------------------------------------------------------

export interface NextAppointmentInfo {
  id: string;
  date: string;
  startTime: string;
}

/**
 * Returns the earliest upcoming non-cancelled, non-no-show appointment for
 * each patient in the organization. Used by the patients list to render the
 * "Zaplanowana wizyta" column without N+1 queries.
 */
export function useSupabaseGabinetNextAppointmentByPatient(
  organizationId: string,
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  const today = new Date().toISOString().split("T")[0];

  return useQuery<Map<string, NextAppointmentInfo>, Error>({
    queryKey: [
      ...supabaseKeys.gabinetAppointments.list(organizationId),
      "nextByPatient",
      today,
    ],
    queryFn: async (): Promise<Map<string, NextAppointmentInfo>> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("gabinet_appointments")
        .select("id, patient_id, date, start_time")
        .eq("organization_id", organizationId)
        .gte("date", today)
        .not("status", "in", '("cancelled","no_show")')
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) throw error;

      const result = new Map<string, NextAppointmentInfo>();
      for (const row of (data ?? []) as {
        id: string;
        patient_id: string;
        date: string;
        start_time: string;
      }[]) {
        if (!result.has(row.patient_id)) {
          result.set(row.patient_id, {
            id: row.id,
            date: row.date,
            startTime: row.start_time,
          });
        }
      }
      return result;
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<Map<string, NextAppointmentInfo>, Error>);
}

// ---------------------------------------------------------------------------
// Single Appointment
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetAppointmentOptions {
  enabled?: boolean;
}

export function useSupabaseGabinetAppointment(
  organizationId: string,
  appointmentId: string | undefined,
  options: UseSupabaseGabinetAppointmentOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedGabinetAppointment | null, Error>({
    queryKey: supabaseKeys.gabinetAppointments.detail(
      organizationId,
      appointmentId ?? "",
    ),
    queryFn: async (): Promise<MappedGabinetAppointment | null> => {
      if (!client || !appointmentId) return null;

      const { data, error } = await client
        .from("gabinet_appointments")
        .select("*")
        .eq("id", appointmentId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapGabinetAppointmentFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId && !!appointmentId,
  } satisfies UseQueryOptions<MappedGabinetAppointment | null, Error>);
}
