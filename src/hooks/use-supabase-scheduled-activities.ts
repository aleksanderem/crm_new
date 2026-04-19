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

export function useSupabaseScheduledActivitiesByDateRange(
  organizationId: string,
  startDate: number,
  endDate: number,
  options: UseSupabaseScheduledActivitiesByDateRangeOpts = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, moduleFilter } = options;

  return useQuery<MappedScheduledActivity[], Error>({
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
      const mapped = (data ?? []).map(mapScheduledActivityFromSupabase);
      if (moduleFilter) {
        return mapped.filter((a) => a.moduleRef?.moduleId === moduleFilter);
      }
      return mapped;
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
        owners = userRows ?? [];
      }
      const ownerMap = new Map(owners.map((u) => [u.id, u]));

      return activities.slice(0, limit).map<UpcomingEvent>((a) => {
        const owner = ownerMap.get(String(a.ownerId));
        const isAppointment =
          a.moduleRef?.moduleId === "gabinet" &&
          a.moduleRef?.entityType === "gabinetAppointment";
        return {
          id: a._id,
          title: a.title,
          startTime: a.dueDate,
          type: a.activityType,
          appointmentLink: isAppointment && a.moduleRef?.entityId
            ? `/dashboard/gabinet/appointments/${a.moduleRef.entityId}`
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

      const rows = data ?? [];
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

      const rows = data ?? [];
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
      const rows = data ?? [];

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
