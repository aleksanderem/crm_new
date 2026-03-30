/**
 * React Query hooks for dashboard analytics — replaces convex/dashboard.ts queries.
 *
 * Each hook returns the EXACT same data shape as the corresponding Convex query
 * so existing chart components work without changes.
 *
 * Strategy: fetch filtered rows from Supabase, aggregate client-side with useMemo.
 * This is pragmatic for dashboard data volumes (typically < 10K rows per org).
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import type { Database } from "@/lib/supabase/database.types";

// ── Row type helpers ──────────────────────────────────────────────────────────

type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];
type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type CallRow = Database["public"]["Tables"]["calls"]["Row"];
type PipelineStageRow = Database["public"]["Tables"]["pipeline_stages"]["Row"];
type UserRow = Database["public"]["Tables"]["users"]["Row"];
type ScheduledActivityRow = Database["public"]["Tables"]["scheduled_activities"]["Row"];

// ── Time Range Helpers (match convex/dashboard.ts rangeStart exactly) ─────────

type TimeRange =
  | "today"
  | "last7days"
  | "last30days"
  | "thisMonth"
  | "last3months"
  | "thisYear"
  | "all";

function rangeStart(range: TimeRange): number {
  const now = Date.now();
  switch (range) {
    case "today": {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case "last7days":
      return now - 7 * 24 * 60 * 60 * 1000;
    case "last30days":
      return now - 30 * 24 * 60 * 60 * 1000;
    case "thisMonth": {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case "last3months":
      return now - 90 * 24 * 60 * 60 * 1000;
    case "thisYear": {
      const d = new Date();
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    default:
      return 0;
  }
}

// ── Bucket Helpers (match convex/dashboard.ts exactly) ────────────────────────

function bucketByDay(timestamps: number[]): { label: string; value: number }[] {
  const map = new Map<string, number>();
  for (const ts of timestamps) {
    const d = new Date(ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, val]) => {
      const parts = k.split("-");
      return { label: `${parseInt(parts[1])}/${parseInt(parts[2])}`, value: val };
    });
}

function bucketByMonth(
  entries: { ts: number; amount: number }[],
): { label: string; value: number }[] {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const map = new Map<string, number>();
  for (const { ts, amount } of entries) {
    const d = new Date(ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map.set(key, (map.get(key) ?? 0) + amount);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, val]) => {
      const [y, m] = k.split("-");
      return { label: `${months[parseInt(m) - 1]} '${y.slice(2)}`, value: val };
    });
}

function bucketByField(
  items: { field: string }[],
): { label: string; value: number }[] {
  const map = new Map<string, number>();
  for (const { field } of items) {
    const key = field || "Unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
}

// ── Dashboard Query Keys ──────────────────────────────────────────────────────

const dashboardKeys = {
  all: [...supabaseKeys.all, "dashboard"] as const,
  stats: (orgId: string) => [...dashboardKeys.all, "stats", orgId] as const,
  leadsByStage: (orgId: string, pipelineId: string) =>
    [...dashboardKeys.all, "leadsByStage", orgId, pipelineId] as const,
  wonDealsByDay: (orgId: string, timeRange: string) =>
    [...dashboardKeys.all, "wonDealsByDay", orgId, timeRange] as const,
  revenueByMonth: (orgId: string, timeRange: string) =>
    [...dashboardKeys.all, "revenueByMonth", orgId, timeRange] as const,
  contactsBySource: (orgId: string, timeRange: string) =>
    [...dashboardKeys.all, "contactsBySource", orgId, timeRange] as const,
  callOutcomeOverview: (orgId: string, timeRange: string) =>
    [...dashboardKeys.all, "callOutcomeOverview", orgId, timeRange] as const,
  topPerformers: (orgId: string, timeRange: string) =>
    [...dashboardKeys.all, "topPerformers", orgId, timeRange] as const,
  upcomingActivities: (orgId: string) =>
    [...dashboardKeys.all, "upcomingActivities", orgId] as const,
};

// ── 1. Dashboard Stats ────────────────────────────────────────────────────────

interface DashboardStats {
  totalContacts: number;
  totalCompanies: number;
  totalLeads: number;
  openLeads: number;
  wonLeads: number;
  lostLeads: number;
  pipelineValue: number;
  wonValue: number;
  winRate: number;
}

export function useSupabaseDashboardStats(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<DashboardStats, Error>({
    queryKey: dashboardKeys.stats(organizationId),
    queryFn: async (): Promise<DashboardStats> => {
      if (!client) throw new Error("Supabase client not ready");

      const [contactsRes, companiesRes, leadsRes] = await Promise.all([
        client
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId),
        client
          .from("companies")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId),
        client
          .from("leads")
          .select("*")
          .eq("organization_id", organizationId),
      ]);

      if (contactsRes.error) throw contactsRes.error;
      if (companiesRes.error) throw companiesRes.error;
      if (leadsRes.error) throw leadsRes.error;

      const allLeads: LeadRow[] = (leadsRes.data ?? []) as LeadRow[];
      const openLeads = allLeads.filter((l) => l.status === "open");
      const wonLeads = allLeads.filter((l) => l.status === "won");
      const lostLeads = allLeads.filter((l) => l.status === "lost");

      const pipelineValue = openLeads.reduce((sum, l) => sum + (l.value ?? 0), 0);
      const wonValue = wonLeads.reduce((sum, l) => sum + (l.value ?? 0), 0);
      const closedCount = wonLeads.length + lostLeads.length;
      const winRate = closedCount > 0 ? wonLeads.length / closedCount : 0;

      return {
        totalContacts: contactsRes.count ?? 0,
        totalCompanies: companiesRes.count ?? 0,
        totalLeads: allLeads.length,
        openLeads: openLeads.length,
        wonLeads: wonLeads.length,
        lostLeads: lostLeads.length,
        pipelineValue,
        wonValue,
        winRate,
      };
    },
    enabled: isReady && !!organizationId,
  });
}

// ── 2. Leads By Stage ─────────────────────────────────────────────────────────

interface LeadsByStageItem {
  stageId: string;
  stageName: string;
  stageColor: string;
  order: number;
  count: number;
  totalValue: number;
}

export function useSupabaseDashboardLeadsByStage(
  organizationId: string,
  pipelineId: string,
) {
  const { client, isReady } = useSupabase();

  return useQuery<LeadsByStageItem[], Error>({
    queryKey: dashboardKeys.leadsByStage(organizationId, pipelineId),
    queryFn: async (): Promise<LeadsByStageItem[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data: stages, error: stageError } = await client
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("order", { ascending: true });

      if (stageError) throw stageError;
      const typedStages: PipelineStageRow[] = (stages ?? []) as PipelineStageRow[];
      if (!typedStages.length) return [];

      const stageIds = typedStages.map((s) => s.id);
      const { data: leads, error: leadsError } = await client
        .from("leads")
        .select("*")
        .eq("organization_id", organizationId)
        .in("pipeline_stage_id", stageIds);

      if (leadsError) throw leadsError;
      const typedLeads: LeadRow[] = (leads ?? []) as LeadRow[];

      const leadsByStage = new Map<string, { count: number; totalValue: number }>();
      for (const lead of typedLeads) {
        const sid = lead.pipeline_stage_id;
        if (!sid) continue;
        const existing = leadsByStage.get(sid) ?? { count: 0, totalValue: 0 };
        existing.count++;
        existing.totalValue += lead.value ?? 0;
        leadsByStage.set(sid, existing);
      }

      return typedStages.map((stage) => {
        const agg = leadsByStage.get(stage.id) ?? { count: 0, totalValue: 0 };
        return {
          stageId: stage.id,
          stageName: stage.name,
          stageColor: stage.color ?? "#888",
          order: stage.order,
          count: agg.count,
          totalValue: agg.totalValue,
        };
      });
    },
    enabled: isReady && !!organizationId && !!pipelineId,
  });
}

// ── 3. Won Deals By Day ───────────────────────────────────────────────────────

export function useSupabaseDashboardWonDealsByDay(
  organizationId: string,
  timeRange: TimeRange,
) {
  const { client, isReady } = useSupabase();
  const start = rangeStart(timeRange);

  return useQuery<{ label: string; value: number }[], Error>({
    queryKey: dashboardKeys.wonDealsByDay(organizationId, timeRange),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("leads")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", "won")
        .gte("updated_at", start);

      if (error) throw error;

      const rows: LeadRow[] = (data ?? []) as LeadRow[];
      const filtered = rows.filter((l) => (l.won_at ?? l.updated_at) >= start);
      return bucketByDay(filtered.map((l) => l.won_at ?? l.updated_at));
    },
    enabled: isReady && !!organizationId,
  });
}

// ── 4. Revenue By Month ───────────────────────────────────────────────────────

export function useSupabaseDashboardRevenueByMonth(
  organizationId: string,
  timeRange: TimeRange,
) {
  const { client, isReady } = useSupabase();
  const start = rangeStart(timeRange);

  return useQuery<{ label: string; value: number }[], Error>({
    queryKey: dashboardKeys.revenueByMonth(organizationId, timeRange),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("leads")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", "won")
        .gte("updated_at", start);

      if (error) throw error;

      const rows: LeadRow[] = (data ?? []) as LeadRow[];
      const filtered = rows.filter((l) => (l.won_at ?? l.updated_at) >= start);
      return bucketByMonth(
        filtered.map((l) => ({
          ts: l.won_at ?? l.updated_at,
          amount: l.value ?? 0,
        })),
      );
    },
    enabled: isReady && !!organizationId,
  });
}

// ── 5. Contacts By Source ─────────────────────────────────────────────────────

export function useSupabaseDashboardContactsBySource(
  organizationId: string,
  timeRange: TimeRange,
) {
  const { client, isReady } = useSupabase();
  const start = rangeStart(timeRange);

  return useQuery<{ label: string; value: number }[], Error>({
    queryKey: dashboardKeys.contactsBySource(organizationId, timeRange),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("contacts")
        .select("*")
        .eq("organization_id", organizationId)
        .gte("created_at", start);

      if (error) throw error;

      const rows: ContactRow[] = (data ?? []) as ContactRow[];
      return bucketByField(rows.map((c) => ({ field: c.source ?? "" })));
    },
    enabled: isReady && !!organizationId,
  });
}

// ── 6. Call Outcome Overview ──────────────────────────────────────────────────

export function useSupabaseDashboardCallOutcomeOverview(
  organizationId: string,
  timeRange: TimeRange,
) {
  const { client, isReady } = useSupabase();
  const start = rangeStart(timeRange);

  return useQuery<{ label: string; value: number }[], Error>({
    queryKey: dashboardKeys.callOutcomeOverview(organizationId, timeRange),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("calls")
        .select("*")
        .eq("organization_id", organizationId)
        .gte("call_date", start);

      if (error) throw error;

      const rows: CallRow[] = (data ?? []) as CallRow[];
      return bucketByField(rows.map((c) => ({ field: c.outcome })));
    },
    enabled: isReady && !!organizationId,
  });
}

// ── 7. Top Performers ─────────────────────────────────────────────────────────

interface TopPerformerItem {
  name: string;
  deals: number;
  value: number;
}

export function useSupabaseDashboardTopPerformers(
  organizationId: string,
  timeRange: TimeRange,
) {
  const { client, isReady } = useSupabase();
  const start = rangeStart(timeRange);

  return useQuery<TopPerformerItem[], Error>({
    queryKey: dashboardKeys.topPerformers(organizationId, timeRange),
    queryFn: async (): Promise<TopPerformerItem[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data: wonLeads, error: leadsError } = await client
        .from("leads")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", "won")
        .not("assigned_to", "is", null)
        .gte("updated_at", start);

      if (leadsError) throw leadsError;

      const rows: LeadRow[] = (wonLeads ?? []) as LeadRow[];
      const filtered = rows.filter((l) => (l.won_at ?? l.updated_at) >= start);

      const byAssignee = new Map<string, { deals: number; value: number }>();
      for (const l of filtered) {
        const key = l.assigned_to!;
        const existing = byAssignee.get(key) ?? { deals: 0, value: 0 };
        existing.deals++;
        existing.value += l.value ?? 0;
        byAssignee.set(key, existing);
      }

      if (byAssignee.size === 0) return [];

      const userIds = [...byAssignee.keys()];
      const { data: users, error: usersError } = await client
        .from("users")
        .select("*")
        .in("id", userIds);

      if (usersError) throw usersError;

      const typedUsers = (users ?? []) as UserRow[];
      const userMap = new Map(typedUsers.map((u) => [u.id, u.name]));

      const results: TopPerformerItem[] = [];
      for (const [userId, stats] of byAssignee) {
        results.push({
          name: userMap.get(userId) ?? "Unknown",
          deals: stats.deals,
          value: stats.value,
        });
      }

      return results.sort((a, b) => b.value - a.value);
    },
    enabled: isReady && !!organizationId,
  });
}

// ── 8. Upcoming Activities ────────────────────────────────────────────────────

interface UpcomingActivityItem {
  _id: string;
  title: string;
  activityType: string;
  dueDate: number;
  isCompleted: boolean;
  ownerName: string;
}

export function useSupabaseDashboardUpcomingActivities(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<UpcomingActivityItem[], Error>({
    queryKey: dashboardKeys.upcomingActivities(organizationId),
    queryFn: async (): Promise<UpcomingActivityItem[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const now = Date.now();
      const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;

      const { data, error } = await client
        .from("scheduled_activities")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_completed", false)
        .lte("due_date", weekFromNow)
        .order("due_date", { ascending: true })
        .limit(10);

      if (error) throw error;

      const rows: ScheduledActivityRow[] = (data ?? []) as ScheduledActivityRow[];
      if (!rows.length) return [];

      const ownerIds = [...new Set(rows.map((a) => a.owner_id).filter(Boolean))];
      let userMap = new Map<string, string>();
      if (ownerIds.length > 0) {
        const { data: users, error: usersError } = await client
          .from("users")
          .select("*")
          .in("id", ownerIds);
        if (usersError) throw usersError;
        const typedUsers = (users ?? []) as UserRow[];
        userMap = new Map(typedUsers.map((u) => [u.id, u.name ?? "Unknown"]));
      }

      return rows.map((a) => ({
        _id: a.id,
        title: a.title,
        activityType: a.activity_type,
        dueDate: a.due_date,
        isCompleted: a.is_completed,
        ownerName: userMap.get(a.owner_id ?? "") ?? "Unknown",
      }));
    },
    enabled: isReady && !!organizationId,
  });
}
