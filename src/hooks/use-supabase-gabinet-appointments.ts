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
}

/**
 * Fetches appointments within a date range for an organization.
 * Supports optional employee filter for per-employee calendar views.
 */
export function useSupabaseGabinetAppointmentsByDateRange(
  organizationId: string,
  startDate: string,
  endDate: string,
  options: UseSupabaseGabinetAppointmentsByDateRangeOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, employeeId } = options;

  return useQuery<MappedGabinetAppointment[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetAppointments.list(organizationId),
      "dateRange",
      startDate,
      endDate,
      employeeId ?? "",
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
}

export function useSupabaseGabinetAppointmentsByPatient(
  organizationId: string,
  patientId: string | undefined,
  options: UseSupabaseGabinetAppointmentsByPatientOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100 } = options;

  return useQuery<MappedGabinetAppointment[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetAppointments.list(organizationId),
      "patient",
      patientId ?? "",
    ],
    queryFn: async (): Promise<MappedGabinetAppointment[]> => {
      if (!client || !patientId) return [];

      const { data, error } = await client
        .from("gabinet_appointments")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("patient_id", patientId)
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
