/**
 * Supabase-backed dashboard analytics hooks for the Gabinet module.
 *
 * Replaces Convex sidebarWidgets queries and nudges queries with direct
 * Supabase reads + client-side aggregation. Used by the gabinet dashboard
 * index page.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import type { Database } from "@/lib/supabase/database.types";

type AppointmentRow = Database["public"]["Tables"]["gabinet_appointments"]["Row"];
type PatientRow = Database["public"]["Tables"]["gabinet_patients"]["Row"];

// ---------------------------------------------------------------------------
// Nudge type (matches convex/nudges.ts NudgeData)
// ---------------------------------------------------------------------------

export interface NudgeData {
  message: string;
  messageValues?: Record<string, string | number>;
  severity: "red" | "yellow" | "green";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function monthPrefix(date: Date): string {
  return (
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0")
  );
}

// ---------------------------------------------------------------------------
// Weekly Appointments (sparkline — 7 days)
// ---------------------------------------------------------------------------

export function useSupabaseGabinetWeeklyAppointments(organizationId: string, locationId?: string) {
  const { client, isReady } = useSupabase();
  const startDate = dateNDaysAgo(6);

  return useQuery<{ day: string; appointments: number }[], Error>({
    queryKey: [...supabaseKeys.gabinetAppointments.list(organizationId), "weekly-sparkline", locationId ?? ""],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_appointments")
        .select("date")
        .eq("organization_id", organizationId)
        .gte("date", startDate)
        .order("date");

      if (locationId) query = query.eq("location_id", locationId);

      const { data, error } = await query;

      if (error) throw error;
      const rows = (data ?? []) as Pick<AppointmentRow, "date">[];

      // Group by date, fill 7 days
      const countByDate = new Map<string, number>();
      for (const r of rows) {
        countByDate.set(r.date, (countByDate.get(r.date) ?? 0) + 1);
      }

      const days: { day: string; appointments: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        const dayLabel = d.toLocaleDateString("pl-PL", { weekday: "short" });
        days.push({ day: dayLabel, appointments: countByDate.get(dateStr) ?? 0 });
      }
      return days;
    },
    enabled: isReady && !!organizationId,
    staleTime: 60_000, // Analytics can be 1min stale
  } satisfies UseQueryOptions<{ day: string; appointments: number }[], Error>);
}

// ---------------------------------------------------------------------------
// Monthly New Patients (sparkline — 6 months)
// ---------------------------------------------------------------------------

export function useSupabaseGabinetMonthlyNewPatients(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<{ month: string; patients: number }[], Error>({
    queryKey: [...supabaseKeys.gabinetPatients.list(organizationId), "monthly-new"],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      // Fetch all patients with created_at to count by month
      const { data, error } = await client
        .from("gabinet_patients")
        .select("created_at")
        .eq("organization_id", organizationId);

      if (error) throw error;
      const rows = (data ?? []) as Pick<PatientRow, "created_at">[];

      const now = new Date();
      const months: { month: string; patients: number }[] = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const prefix = monthPrefix(d);
        const label = d.toLocaleDateString("pl-PL", { month: "short" });
        const count = rows.filter((p) => {
          const created = new Date(p.created_at);
          return monthPrefix(created) === prefix;
        }).length;
        months.push({ month: label, patients: count });
      }
      return months;
    },
    enabled: isReady && !!organizationId,
    staleTime: 60_000,
  } satisfies UseQueryOptions<{ month: string; patients: number }[], Error>);
}

// ---------------------------------------------------------------------------
// Weekly Completed Treatments (sparkline — 7 days)
// ---------------------------------------------------------------------------

export function useSupabaseGabinetWeeklyCompletedTreatments(organizationId: string, locationId?: string) {
  const { client, isReady } = useSupabase();
  const startDate = dateNDaysAgo(6);

  return useQuery<{ day: string; completed: number }[], Error>({
    queryKey: [...supabaseKeys.gabinetAppointments.list(organizationId), "weekly-completed", locationId ?? ""],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_appointments")
        .select("date, status")
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .gte("date", startDate)
        .order("date");

      if (locationId) query = query.eq("location_id", locationId);

      const { data, error } = await query;

      if (error) throw error;
      const rows = (data ?? []) as Pick<AppointmentRow, "date" | "status">[];

      const countByDate = new Map<string, number>();
      for (const r of rows) {
        countByDate.set(r.date, (countByDate.get(r.date) ?? 0) + 1);
      }

      const days: { day: string; completed: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        const dayLabel = d.toLocaleDateString("pl-PL", { weekday: "short" });
        days.push({ day: dayLabel, completed: countByDate.get(dateStr) ?? 0 });
      }
      return days;
    },
    enabled: isReady && !!organizationId,
    staleTime: 60_000,
  } satisfies UseQueryOptions<{ day: string; completed: number }[], Error>);
}

// ---------------------------------------------------------------------------
// Monthly Appointments (area chart — 6 months)
// ---------------------------------------------------------------------------

export function useSupabaseGabinetMonthlyAppointments(organizationId: string, locationId?: string) {
  const { client, isReady } = useSupabase();

  return useQuery<{ month: string; appointments: number; completed: number }[], Error>({
    queryKey: [...supabaseKeys.gabinetAppointments.list(organizationId), "monthly", locationId ?? ""],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const now = new Date();
      const oldestStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)
        .toISOString()
        .split("T")[0];

      let query = client
        .from("gabinet_appointments")
        .select("date, status")
        .eq("organization_id", organizationId)
        .gte("date", oldestStart)
        .order("date");

      if (locationId) query = query.eq("location_id", locationId);

      const { data, error } = await query;

      if (error) throw error;
      const rows = (data ?? []) as Pick<AppointmentRow, "date" | "status">[];

      const months: { month: string; appointments: number; completed: number }[] = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const prefix = monthPrefix(d);
        const label = d.toLocaleDateString("pl-PL", { month: "short" });
        const monthRows = rows.filter((r) => r.date.startsWith(prefix));
        months.push({
          month: label,
          appointments: monthRows.length,
          completed: monthRows.filter((r) => r.status === "completed").length,
        });
      }
      return months;
    },
    enabled: isReady && !!organizationId,
    staleTime: 60_000,
  } satisfies UseQueryOptions<{ month: string; appointments: number; completed: number }[], Error>);
}

// ---------------------------------------------------------------------------
// Appointment Status Distribution (donut chart — current month)
// ---------------------------------------------------------------------------

export function useSupabaseGabinetAppointmentStatusDistribution(organizationId: string, locationId?: string) {
  const { client, isReady } = useSupabase();

  return useQuery<{ total: number; statuses: { status: string; count: number }[] }, Error>({
    queryKey: [...supabaseKeys.gabinetAppointments.list(organizationId), "status-distribution", locationId ?? ""],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const now = new Date();
      const thisMonthStart = `${monthPrefix(now)}-01`;
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
        .toISOString()
        .split("T")[0];

      let query = client
        .from("gabinet_appointments")
        .select("status")
        .eq("organization_id", organizationId)
        .gte("date", thisMonthStart)
        .lt("date", nextMonthStart);

      if (locationId) query = query.eq("location_id", locationId);

      const { data, error } = await query;

      if (error) throw error;
      const rows = (data ?? []) as Pick<AppointmentRow, "status">[];

      const statusCounts: Record<string, number> = {};
      for (const r of rows) {
        statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
      }

      return {
        total: rows.length,
        statuses: Object.entries(statusCounts)
          .map(([status, count]) => ({ status, count }))
          .sort((a, b) => b.count - a.count),
      };
    },
    enabled: isReady && !!organizationId,
    staleTime: 60_000,
  } satisfies UseQueryOptions<{ total: number; statuses: { status: string; count: number }[] }, Error>);
}

// ---------------------------------------------------------------------------
// Top Treatments (ranked by appointment count)
// ---------------------------------------------------------------------------

export function useSupabaseGabinetTopTreatments(organizationId: string, locationId?: string) {
  const { client, isReady } = useSupabase();

  return useQuery<{ label: string; value: number }[], Error>({
    queryKey: [...supabaseKeys.gabinetAppointments.list(organizationId), "top-treatments", locationId ?? ""],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      // When filtering by location, resolve appointment IDs first (junction table has no location_id)
      let appointmentIds: string[] | null = null;
      if (locationId) {
        const locRes = await client
          .from("gabinet_appointments")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("location_id", locationId);
        if (locRes.error) throw locRes.error;
        appointmentIds = ((locRes.data ?? []) as { id: string }[]).map((r) => r.id);
      }

      let junctionQuery = client
        .from("gabinet_appointment_treatments")
        .select("treatment_id")
        .eq("organization_id", organizationId)
        .not("treatment_id", "is", null);

      if (appointmentIds !== null) {
        junctionQuery = junctionQuery.in(
          "appointment_id",
          appointmentIds.length ? appointmentIds : [""],
        );
      }

      // Fetch treatment_ids and treatment names in parallel
      const [apptRes, treatRes] = await Promise.all([
        junctionQuery,
        client
          .from("gabinet_treatments")
          .select("id, name")
          .eq("organization_id", organizationId),
      ]);

      if (apptRes.error) throw apptRes.error;
      if (treatRes.error) throw treatRes.error;

      const apptRows = (apptRes.data ?? []) as { treatment_id: string | null }[];
      const treatRows = (treatRes.data ?? []) as { id: string; name: string }[];

      const treatmentNameMap = new Map(treatRows.map((t) => [t.id, t.name]));
      const counts = new Map<string, number>();

      for (const a of apptRows) {
        if (a.treatment_id) {
          counts.set(a.treatment_id, (counts.get(a.treatment_id) ?? 0) + 1);
        }
      }

      const results: { label: string; value: number }[] = [];
      for (const [id, count] of counts) {
        const name = treatmentNameMap.get(id);
        if (name) results.push({ label: name, value: count });
      }

      return results.sort((a, b) => b.value - a.value).slice(0, 5);
    },
    enabled: isReady && !!organizationId,
    staleTime: 60_000,
  } satisfies UseQueryOptions<{ label: string; value: number }[], Error>);
}

// ---------------------------------------------------------------------------
// Weekly Revenue (sparkline — 7 days)
// ---------------------------------------------------------------------------

export function useSupabaseGabinetWeeklyRevenue(organizationId: string, locationId?: string) {
  const { client, isReady } = useSupabase();
  const startDate = dateNDaysAgo(6);

  return useQuery<{ day: string; revenue: number }[], Error>({
    queryKey: [...supabaseKeys.gabinetAppointments.list(organizationId), "weekly-revenue", locationId ?? ""],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      // Step 1: fetch qualifying appointments (id + date) for the date window.
      let apptQuery = client
        .from("gabinet_appointments")
        .select("id, date")
        .eq("organization_id", organizationId)
        .gte("date", startDate)
        .not("status", "in", '("cancelled","no_show")')
        .order("date");

      if (locationId) apptQuery = apptQuery.eq("location_id", locationId);

      const apptRes = await apptQuery;
      if (apptRes.error) throw apptRes.error;

      const appointments = (apptRes.data ?? []) as Pick<AppointmentRow, "id" | "date">[];
      const appointmentIds = appointments.map((a) => a.id);
      const appointmentDateMap = new Map(appointments.map((a) => [a.id, a.date]));

      // Step 2: sum price_at_booking from the junction table (one row per treatment per appointment).
      let treatmentRows: { appointment_id: string; price_at_booking: number | null }[] = [];
      if (appointmentIds.length > 0) {
        const treatRes = await client
          .from("gabinet_appointment_treatments")
          .select("appointment_id, price_at_booking")
          .eq("organization_id", organizationId)
          .in("appointment_id", appointmentIds);
        if (treatRes.error) throw treatRes.error;
        treatmentRows = (treatRes.data ?? []) as { appointment_id: string; price_at_booking: number | null }[];
      }

      // Step 3: aggregate revenue per date.
      const revenueByDate = new Map<string, number>();
      for (const t of treatmentRows) {
        const date = appointmentDateMap.get(t.appointment_id);
        if (date) {
          revenueByDate.set(date, (revenueByDate.get(date) ?? 0) + (t.price_at_booking ?? 0));
        }
      }

      const days: { day: string; revenue: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        const dayLabel = d.toLocaleDateString("pl-PL", { weekday: "short" });
        days.push({ day: dayLabel, revenue: revenueByDate.get(dateStr) ?? 0 });
      }
      return days;
    },
    enabled: isReady && !!organizationId,
    staleTime: 60_000,
  } satisfies UseQueryOptions<{ day: string; revenue: number }[], Error>);
}

// ---------------------------------------------------------------------------
// Nudges
// ---------------------------------------------------------------------------

/** Appointment nudges: count of today's unconfirmed (scheduled) appointments */
export function useSupabaseGabinetAppointmentNudges(organizationId: string, locationId?: string) {
  const { client, isReady } = useSupabase();
  const today = todayStr();

  return useQuery<NudgeData[], Error>({
    queryKey: [...supabaseKeys.gabinetAppointments.list(organizationId), "nudges", today, locationId ?? ""],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_appointments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("date", today)
        .eq("status", "scheduled");

      if (locationId) query = query.eq("location_id", locationId);

      const { count, error } = await query;

      if (error) throw error;
      const n = count ?? 0;
      if (n === 0) return [];

      return [{
        message: "sidebar.nudges.gabinet.appointments.unconfirmedSms",
        messageValues: { count: n },
        severity: "yellow" as const,
      }];
    },
    enabled: isReady && !!organizationId,
    staleTime: 120_000,
  } satisfies UseQueryOptions<NudgeData[], Error>);
}

/** Leave nudges: count of pending leave requests */
export function useSupabaseGabinetLeaveNudges(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<NudgeData[], Error>({
    queryKey: [...supabaseKeys.gabinetLeaves.list(organizationId), "nudges"],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { count, error } = await client
        .from("gabinet_leaves")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "pending");

      if (error) throw error;
      const n = count ?? 0;
      if (n === 0) return [];

      return [{
        message: "sidebar.nudges.gabinet.leave.pendingApproval",
        messageValues: { count: n },
        severity: "red" as const,
      }];
    },
    enabled: isReady && !!organizationId,
    staleTime: 120_000,
  } satisfies UseQueryOptions<NudgeData[], Error>);
}

/** Patient nudges: patients missing contact info + no recent visit */
export function useSupabaseGabinetPatientNudges(organizationId: string, locationId?: string) {
  const { client, isReady } = useSupabase();

  return useQuery<NudgeData[], Error>({
    queryKey: [...supabaseKeys.gabinetPatients.list(organizationId), "nudges", locationId ?? ""],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");
      const nudges: NudgeData[] = [];

      // Patients missing phone or email
      const { data: patients, error: pErr } = await client
        .from("gabinet_patients")
        .select("id, email, phone")
        .eq("organization_id", organizationId);

      if (pErr) throw pErr;
      const rows = (patients ?? []) as { id: string; email: string; phone: string | null }[];

      const missingContact = rows.filter((p) => !p.phone && !p.email).length;
      if (missingContact > 0) {
        nudges.push({
          message: "sidebar.nudges.gabinet.patients.missingContact",
          messageValues: { count: missingContact },
          severity: "yellow",
        });
      }

      // Patients with no recent visit (90 days), optionally scoped to a location
      const ninetyDaysAgo = dateNDaysAgo(90);
      let apptQuery = client
        .from("gabinet_appointments")
        .select("patient_id")
        .eq("organization_id", organizationId)
        .gte("date", ninetyDaysAgo)
        .not("status", "in", '("cancelled","no_show")');

      if (locationId) apptQuery = apptQuery.eq("location_id", locationId);

      const { data: recentAppts, error: aErr } = await apptQuery;

      if (aErr) throw aErr;
      const recentPatientIds = new Set(
        ((recentAppts ?? []) as { patient_id: string }[]).map((a) => a.patient_id),
      );
      const noRecentVisit = rows.filter((p) => !recentPatientIds.has(p.id)).length;

      if (noRecentVisit > 3) {
        nudges.push({
          message: "sidebar.nudges.gabinet.patients.noRecentVisit",
          messageValues: { count: noRecentVisit },
          severity: "yellow",
        });
      }

      return nudges.slice(0, 2);
    },
    enabled: isReady && !!organizationId,
    staleTime: 120_000,
  } satisfies UseQueryOptions<NudgeData[], Error>);
}
