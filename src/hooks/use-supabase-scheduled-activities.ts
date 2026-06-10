/**
 * React Query hooks for fetching scheduled activities from Supabase.
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapScheduledActivityFromSupabase, type MappedScheduledActivity } from "@/lib/supabase/mappers";

// ── List ──────────────────────────────────────────────────────────────────────

interface UseSupabaseScheduledActivitiesListOpts {
  enabled?: boolean;
  limit?: number;
  isCompleted?: boolean;
  sortOrder?: "asc" | "desc";
}

export function useSupabaseScheduledActivitiesList(
  organizationId: string,
  options: UseSupabaseScheduledActivitiesListOpts = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 200, isCompleted, sortOrder = "desc" } = options;

  return useQuery<MappedScheduledActivity[], Error>({
    queryKey: [...supabaseKeys.scheduledActivities.list(organizationId), isCompleted ?? "all"],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("scheduled_activities")
        .select("*")
        .eq("organization_id", organizationId);

      if (isCompleted !== undefined) {
        query = query.eq("is_completed", isCompleted);
      }

      const { data, error } = await query
        .order("due_date", { ascending: sortOrder === "asc" })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapScheduledActivityFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ── Get By ID ─────────────────────────────────────────────────────────────────

export function useSupabaseScheduledActivityById(
  organizationId: string,
  activityId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<MappedScheduledActivity | null, Error>({
    queryKey: [...supabaseKeys.scheduledActivities.list(organizationId), "byId", activityId],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");
      if (!activityId) return null;
      const { data, error } = await client
        .from("scheduled_activities")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", activityId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapScheduledActivityFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId && !!activityId,
  });
}

// ── By Entity ─────────────────────────────────────────────────────────────────

export function useSupabaseScheduledActivitiesByEntity(
  organizationId: string,
  entityType: string,
  entityId: string,
  options?: { enabled?: boolean },
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<MappedScheduledActivity[], Error>({
    queryKey: [...supabaseKeys.scheduledActivities.list(organizationId), "byEntity", entityType, entityId],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("scheduled_activities")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("linked_entity_type", entityType)
        .eq("linked_entity_id", entityId)
        .order("due_date", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapScheduledActivityFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!entityType && !!entityId,
  });
}

// ── Due Today ─────────────────────────────────────────────────────────────────

export function useSupabaseScheduledActivitiesDueToday(
  organizationId: string,
  options?: { enabled?: boolean },
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<MappedScheduledActivity[], Error>({
    queryKey: [...supabaseKeys.scheduledActivities.list(organizationId), "dueToday"],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const endOfDay = startOfDay + 86400000 - 1;

      const { data, error } = await client
        .from("scheduled_activities")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_completed", false)
        .gte("due_date", startOfDay)
        .lte("due_date", endOfDay)
        .order("due_date", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapScheduledActivityFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ── Due This Week ─────────────────────────────────────────────────────────────

export function useSupabaseScheduledActivitiesDueThisWeek(
  organizationId: string,
  options?: { enabled?: boolean },
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<MappedScheduledActivity[], Error>({
    queryKey: [...supabaseKeys.scheduledActivities.list(organizationId), "dueThisWeek"],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const now = new Date();
      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1).getTime();
      const endOfWeek = startOfWeek + 7 * 86400000 - 1;

      const { data, error } = await client
        .from("scheduled_activities")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_completed", false)
        .gte("due_date", startOfWeek)
        .lte("due_date", endOfWeek)
        .order("due_date", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapScheduledActivityFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ── By Date Range ─────────────────────────────────────────────────────────────

interface UseSupabaseScheduledActivitiesByDateRangeOpts {
  enabled?: boolean;
  moduleFilter?: string; // matches module_ref.moduleId
}

export interface CalendarScheduledActivity extends MappedScheduledActivity {
  metadata: Record<string, unknown>;
}

export function useSupabaseScheduledActivitiesByDateRange(
  organizationId: string,
  startDate: number,
  endDate: number,
  options: UseSupabaseScheduledActivitiesByDateRangeOpts = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, moduleFilter } = options;

  return useQuery<CalendarScheduledActivity[], Error>({
    queryKey: [
      ...supabaseKeys.scheduledActivities.list(organizationId),
      "dateRange",
      startDate,
      endDate,
      moduleFilter ?? "all",
    ],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("scheduled_activities")
        .select("*")
        .eq("organization_id", organizationId)
        .gte("due_date", startDate)
        .lte("due_date", endDate)
        .order("due_date", { ascending: true });

      if (error) throw error;
      let activities = (data ?? []).map(mapScheduledActivityFromSupabase);
      if (moduleFilter) {
        activities = activities.filter((a) => a.moduleRef?.moduleId === moduleFilter);
      }

      // Enrich gabinet-linked activities with appointment metadata so the
      // calendar UI (which reads ev.metadata.status / patientName /
      // treatmentName / appointmentId) keeps working after the move to
      // Supabase-primary reads.
      const gabinetEntityIds = Array.from(
        new Set(
          activities
            .filter((a) => a.moduleRef?.moduleId === "gabinet")
            .map((a) => a.moduleRef?.entityId)
            .filter((id): id is string => !!id),
        ),
      );

      let apptMap = new Map<string, { status: string; patientId: string; treatmentId: string | null }>();
      let patientMap = new Map<string, string>();
      let treatmentMap = new Map<string, string>();

      if (gabinetEntityIds.length > 0) {
        const { data: appts, error: apptErr } = await client
          .from("gabinet_appointments")
          .select("id,status,patient_id,treatment_id")
          .in("id", gabinetEntityIds);
        if (apptErr) throw apptErr;
        const apptRows = (appts ?? []) as Array<{
          id: string;
          status: string | null;
          patient_id: string;
          treatment_id: string | null;
        }>;
        apptMap = new Map(
          apptRows.map((a) => [
            a.id,
            {
              status: a.status ?? "scheduled",
              patientId: a.patient_id,
              treatmentId: a.treatment_id ?? null,
            },
          ]),
        );

        const patientIds = Array.from(new Set(Array.from(apptMap.values()).map((a) => a.patientId).filter(Boolean)));
        if (patientIds.length > 0) {
          const { data: patients } = await client
            .from("gabinet_patients")
            .select("id,first_name,last_name")
            .in("id", patientIds);
          const patientRows = (patients ?? []) as Array<{
            id: string;
            first_name: string | null;
            last_name: string | null;
          }>;
          patientMap = new Map(
            patientRows.map((p) => [
              p.id,
              `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
            ]),
          );
        }

        const treatmentIds = Array.from(
          new Set(
            Array.from(apptMap.values())
              .map((a) => a.treatmentId)
              .filter((id): id is string => !!id),
          ),
        );
        if (treatmentIds.length > 0) {
          const { data: treatments } = await client
            .from("gabinet_treatments")
            .select("id,name")
            .in("id", treatmentIds);
          const treatmentRows = (treatments ?? []) as Array<{
            id: string;
            name: string | null;
          }>;
          treatmentMap = new Map(
            treatmentRows.map((t) => [t.id, t.name ?? ""]),
          );
        }
      }

      return activities.map<CalendarScheduledActivity>((a) => {
        const moduleRef = a.moduleRef;
        const metadata: Record<string, unknown> = {};
        if (moduleRef?.moduleId === "gabinet" && moduleRef.entityId) {
          const appt = apptMap.get(moduleRef.entityId);
          if (appt) {
            metadata.status = appt.status;
            metadata.appointmentId = moduleRef.entityId;
            metadata.patientName = patientMap.get(appt.patientId) ?? undefined;
            if (appt.treatmentId) {
              metadata.treatmentName = treatmentMap.get(appt.treatmentId) ?? undefined;
            }
          }
        }
        return { ...a, metadata };
      });
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ── Upcoming Events (Smart Agenda) ────────────────────────────────────────────

export interface UpcomingEvent {
  id: string;
  title: string;
  startTime: number;
  type: string;
  appointmentLink: string | null;
  ownerId: string;
  ownerName: string;
  ownerImage: string | null;
}

interface UseSupabaseUpcomingEventsOpts {
  enabled?: boolean;
  onlyMine?: boolean;
  limit?: number;
}

export function useSupabaseUpcomingEvents(
  organizationId: string,
  userId: string,
  options: UseSupabaseUpcomingEventsOpts = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, onlyMine = false, limit = 5 } = options;

  return useQuery<UpcomingEvent[], Error>({
    queryKey: [
      ...supabaseKeys.scheduledActivities.list(organizationId),
      "upcoming",
      onlyMine ? userId : "all",
      limit,
    ],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const now = Date.now();
      let query = client
        .from("scheduled_activities")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_completed", false)
        .gte("due_date", now);

      if (onlyMine) {
        query = query.eq("owner_id", userId);
      }

      const { data, error } = await query
        .order("due_date", { ascending: true })
        .limit(limit * 2); // fetch extra to fill after owner join

      if (error) throw error;
      const activities = (data ?? []).map(mapScheduledActivityFromSupabase);

      const ownerIds = Array.from(new Set(activities.map((a) => a.ownerId).filter(Boolean)));
      let owners: Array<{ id: string; name: string | null; email: string | null; image: string | null }> = [];
      if (ownerIds.length > 0) {
        const { data: userRows, error: usersErr } = await client
          .from("users")
          .select("id,name,email,image")
          .in("id", ownerIds);
        if (usersErr) throw usersErr;
        owners = (userRows ?? []) as Array<{
          id: string;
          name: string | null;
          email: string | null;
          image: string | null;
        }>;
      }
      const ownerMap = new Map(owners.map((u) => [u.id, u]));

      return activities.slice(0, limit).map<UpcomingEvent>((a) => {
        const owner = ownerMap.get(String(a.ownerId));
        const moduleRef = a.moduleRef;
        const isAppointment =
          moduleRef?.moduleId === "gabinet" &&
          moduleRef?.entityType === "gabinetAppointment";
        return {
          id: a._id,
          title: a.title,
          startTime: a.dueDate,
          type: a.activityType,
          appointmentLink: isAppointment && moduleRef?.entityId
            ? `/dashboard/gabinet/appointments/${moduleRef.entityId}`
            : null,
          ownerId: String(a.ownerId),
          ownerName: owner?.name ?? owner?.email ?? "?",
          ownerImage: owner?.image ?? null,
        };
      });
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ── Activities KPIs (overdue/today/completion) ────────────────────────────────

export interface ActivitiesKpis {
  overdue: number;
  today: number;
  completionRate: number;
}

export function useSupabaseActivitiesKpis(
  organizationId: string,
  userId: string,
  options?: { enabled?: boolean },
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<ActivitiesKpis, Error>({
    queryKey: [...supabaseKeys.scheduledActivities.list(organizationId), "kpis", userId],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");
      const { data, error } = await client
        .from("scheduled_activities")
        .select("due_date,is_completed,owner_id")
        .eq("organization_id", organizationId)
        .eq("owner_id", userId);
      if (error) throw error;

      const now = Date.now();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = todayStart.getTime() + 86400000;

      const rows = (data ?? []) as Array<{
        due_date: number | null;
        is_completed: boolean | null;
        owner_id: string | null;
      }>;
      const overdue = rows.filter(
        (a) => a.due_date && a.due_date < now && !a.is_completed,
      ).length;
      const today = rows.filter(
        (a) => a.due_date && a.due_date >= todayStart.getTime() && a.due_date < todayEnd,
      ).length;
      const completed = rows.filter((a) => a.is_completed).length;
      const completionRate = rows.length > 0 ? Math.round((completed / rows.length) * 100) : 0;

      return { overdue, today, completionRate };
    },
    enabled: enabled && isReady && !!organizationId && !!userId,
  });
}

// ── Calendar KPIs (today/overdue/thisWeek/requiresCompletion) ─────────────────

export interface CalendarKpis {
  today: number;
  overdue: number;
  thisWeek: number;
  requiresCompletion: number;
}

export function useSupabaseCalendarKpis(
  organizationId: string,
  userId: string,
  options?: { enabled?: boolean },
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<CalendarKpis, Error>({
    queryKey: [...supabaseKeys.scheduledActivities.list(organizationId), "calendarKpis", userId],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");
      const { data, error } = await client
        .from("scheduled_activities")
        .select("due_date,is_completed,owner_id,requires_completion")
        .eq("organization_id", organizationId)
        .eq("owner_id", userId);
      if (error) throw error;

      const now = Date.now();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = todayStart.getTime() + 86400000;
      const weekEnd = todayStart.getTime() + 7 * 86400000;

      const rows = (data ?? []) as Array<{
        due_date: number | null;
        is_completed: boolean | null;
        owner_id: string | null;
        requires_completion: boolean | null;
      }>;
      return {
        today: rows.filter((a) => a.due_date && a.due_date >= todayStart.getTime() && a.due_date < todayEnd).length,
        overdue: rows.filter((a) => a.due_date && a.due_date < now && !a.is_completed).length,
        thisWeek: rows.filter((a) => a.due_date && a.due_date >= todayStart.getTime() && a.due_date < weekEnd).length,
        requiresCompletion: rows.filter((a) => a.requires_completion === true).length,
      };
    },
    enabled: enabled && isReady && !!organizationId && !!userId,
  });
}

// ── Weekly Activities Trend (last 7 days created vs completed) ────────────────

export interface WeeklyActivitiesTrendDay {
  day: string;
  created: number;
  completed: number;
}

export function useSupabaseWeeklyActivitiesTrend(
  organizationId: string,
  userId: string,
  options?: { enabled?: boolean },
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<WeeklyActivitiesTrendDay[], Error>({
    queryKey: [...supabaseKeys.scheduledActivities.list(organizationId), "weeklyTrend", userId],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const dayNames = ["ni", "po", "wt", "śr", "cz", "pt", "so"];
      const now = new Date();
      const days: { day: string; created: number; completed: number; _start: number; _end: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const start = d.getTime();
        days.push({ day: dayNames[d.getDay()], created: 0, completed: 0, _start: start, _end: start + 86400000 });
      }

      const { data, error } = await client
        .from("scheduled_activities")
        .select("created_at,is_completed,completed_at,owner_id")
        .eq("organization_id", organizationId)
        .eq("owner_id", userId)
        .gte("created_at", days[0]._start);
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        created_at: number;
        is_completed: boolean | null;
        completed_at: number | null;
        owner_id: string | null;
      }>;

      for (const day of days) {
        day.created = rows.filter((a) => a.created_at >= day._start && a.created_at < day._end).length;
        day.completed = rows.filter(
          (a) => a.is_completed && a.completed_at && a.completed_at >= day._start && a.completed_at < day._end,
        ).length;
      }
      return days.map(({ day, created, completed }) => ({ day, created, completed }));
    },
    enabled: enabled && isReady && !!organizationId && !!userId,
  });
}

// ── Overdue ───────────────────────────────────────────────────────────────────

export function useSupabaseScheduledActivitiesOverdue(
  organizationId: string,
  options?: { enabled?: boolean },
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<MappedScheduledActivity[], Error>({
    queryKey: [...supabaseKeys.scheduledActivities.list(organizationId), "overdue"],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const now = Date.now();

      const { data, error } = await client
        .from("scheduled_activities")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_completed", false)
        .lt("due_date", now)
        .order("due_date", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapScheduledActivityFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}
