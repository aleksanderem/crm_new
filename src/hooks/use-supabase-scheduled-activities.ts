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
