/**
 * React Query hooks for sidebar widget KPIs — replaces convex/sidebarWidgets.ts reads.
 *
 * All data aggregation is done client-side from Supabase rows, matching the exact
 * return shapes of the original Convex queries so widget components work unchanged.
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";

// ── Shared Helpers ─────────────────────────────────────────────────────────────

const DAY_NAMES = ["ni", "po", "wt", "śr", "cz", "pt", "so"] as const;

function buildWeekDays() {
  const now = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    const start = d.getTime();
    return { day: DAY_NAMES[d.getDay()], _start: start, _end: start + 86_400_000 };
  });
}

const widgetKeys = {
  all: [...supabaseKeys.all, "sidebarWidgets"] as const,
  insightsKpis: (orgId: string) =>
    [...widgetKeys.all, "insightsKpis", orgId] as const,
  dealsKpis: (orgId: string) => [...widgetKeys.all, "dealsKpis", orgId] as const,
  weeklyCrmTrend: (orgId: string) =>
    [...widgetKeys.all, "weeklyCrmTrend", orgId] as const,
  contactsKpis: (orgId: string) =>
    [...widgetKeys.all, "contactsKpis", orgId] as const,
  companiesKpis: (orgId: string) =>
    [...widgetKeys.all, "companiesKpis", orgId] as const,
  inboxKpis: (orgId: string) => [...widgetKeys.all, "inboxKpis", orgId] as const,
  callsKpis: (orgId: string) => [...widgetKeys.all, "callsKpis", orgId] as const,
  productsKpis: (orgId: string) =>
    [...widgetKeys.all, "productsKpis", orgId] as const,
  leadsByStage: (orgId: string) =>
    [...widgetKeys.all, "leadsByStage", orgId] as const,
  contactsBySource: (orgId: string) =>
    [...widgetKeys.all, "contactsBySource", orgId] as const,
  topProducts: (orgId: string) =>
    [...widgetKeys.all, "topProducts", orgId] as const,
  topCompanies: (orgId: string) =>
    [...widgetKeys.all, "topCompanies", orgId] as const,
  weeklyContactsTrend: (orgId: string) =>
    [...widgetKeys.all, "weeklyContactsTrend", orgId] as const,
  weeklyCompaniesTrend: (orgId: string) =>
    [...widgetKeys.all, "weeklyCompaniesTrend", orgId] as const,
  weeklyDealsTrend: (orgId: string) =>
    [...widgetKeys.all, "weeklyDealsTrend", orgId] as const,
  weeklyCallsTrend: (orgId: string) =>
    [...widgetKeys.all, "weeklyCallsTrend", orgId] as const,
  formDocumentsKpis: (orgId: string) =>
    [...widgetKeys.all, "formDocumentsKpis", orgId] as const,
  formDocumentsByStatus: (orgId: string) =>
    [...widgetKeys.all, "formDocumentsByStatus", orgId] as const,
  weeklyFormDocumentsTrend: (orgId: string) =>
    [...widgetKeys.all, "weeklyFormDocumentsTrend", orgId] as const,
  topDocumentCategories: (orgId: string) =>
    [...widgetKeys.all, "topDocumentCategories", orgId] as const,
};

// ── Insights KPIs ──────────────────────────────────────────────────────────────

interface InsightsKpis {
  revenue: number;
  revenueTrend: number;
  pipelineValue: number;
  openDeals: number;
  totalContacts: number;
  totalCompanies: number;
  winRate: number;
}

export function useSupabaseInsightsKpis(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<InsightsKpis, Error>({
    queryKey: widgetKeys.insightsKpis(organizationId),
    queryFn: async (): Promise<InsightsKpis> => {
      if (!client) throw new Error("Supabase client not ready");

      const thisMonthStart = new Date();
      thisMonthStart.setDate(1);
      thisMonthStart.setHours(0, 0, 0, 0);
      const lastMonthStart = new Date(thisMonthStart);
      lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

      const [contactsRes, companiesRes, leadsRes] = await Promise.all([
        client
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId),
        client
          .from("companies")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId),
        client
          .from("leads")
          .select("status, value, won_at, updated_at")
          .eq("organization_id", organizationId),
      ]);

      if (contactsRes.error) throw contactsRes.error;
      if (companiesRes.error) throw companiesRes.error;
      if (leadsRes.error) throw leadsRes.error;

      const leads = (leadsRes.data ?? []) as {
        status: string;
        value: number | null;
        won_at: number | null;
        updated_at: number;
      }[];

      const openLeads = leads.filter((l) => l.status === "open");
      const wonLeads = leads.filter((l) => l.status === "won");
      const lostLeads = leads.filter((l) => l.status === "lost");
      const closedCount = wonLeads.length + lostLeads.length;

      const tm = thisMonthStart.getTime();
      const lm = lastMonthStart.getTime();

      const thisMonthWon = wonLeads.filter((l) => (l.won_at ?? l.updated_at) >= tm);
      const lastMonthWon = wonLeads.filter(
        (l) => (l.won_at ?? l.updated_at) >= lm && (l.won_at ?? l.updated_at) < tm,
      );

      const thisMonthRevenue = thisMonthWon.reduce((s, l) => s + (l.value ?? 0), 0);
      const lastMonthRevenue = lastMonthWon.reduce((s, l) => s + (l.value ?? 0), 0);
      const revenueTrend =
        lastMonthRevenue > 0
          ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
          : 0;

      return {
        revenue: thisMonthRevenue,
        revenueTrend,
        pipelineValue: openLeads.reduce((s, l) => s + (l.value ?? 0), 0),
        openDeals: openLeads.length,
        totalContacts: contactsRes.count ?? 0,
        totalCompanies: companiesRes.count ?? 0,
        winRate: closedCount > 0 ? Math.round((wonLeads.length / closedCount) * 100) : 0,
      };
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Deals KPIs ─────────────────────────────────────────────────────────────────

interface DealsKpis {
  openCount: number;
  pipelineValue: number;
  winRate: number;
}

export function useSupabaseDealsKpis(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<DealsKpis, Error>({
    queryKey: widgetKeys.dealsKpis(organizationId),
    queryFn: async (): Promise<DealsKpis> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("leads")
        .select("status, value")
        .eq("organization_id", organizationId);

      if (error) throw error;

      const leads = (data ?? []) as { status: string; value: number | null }[];
      const open = leads.filter((l) => l.status === "open");
      const won = leads.filter((l) => l.status === "won");
      const lost = leads.filter((l) => l.status === "lost");
      const closed = won.length + lost.length;

      return {
        openCount: open.length,
        pipelineValue: open.reduce((s, l) => s + (l.value ?? 0), 0),
        winRate: closed > 0 ? Math.round((won.length / closed) * 100) : 0,
      };
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Weekly CRM Trend ───────────────────────────────────────────────────────────

export function useSupabaseWeeklyCrmTrend(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<Array<{ day: string; contacts: number; deals: number }>, Error>({
    queryKey: widgetKeys.weeklyCrmTrend(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const days = buildWeekDays();
      const weekStart = days[0]._start;

      const [contactsRes, leadsRes] = await Promise.all([
        client
          .from("contacts")
          .select("created_at")
          .eq("organization_id", organizationId)
          .gte("created_at", weekStart),
        client
          .from("leads")
          .select("created_at")
          .eq("organization_id", organizationId)
          .gte("created_at", weekStart),
      ]);

      if (contactsRes.error) throw contactsRes.error;
      if (leadsRes.error) throw leadsRes.error;

      const contacts = (contactsRes.data ?? []) as { created_at: number }[];
      const leads = (leadsRes.data ?? []) as { created_at: number }[];

      return days.map(({ day, _start, _end }) => ({
        day,
        contacts: contacts.filter((c) => c.created_at >= _start && c.created_at < _end).length,
        deals: leads.filter((l) => l.created_at >= _start && l.created_at < _end).length,
      }));
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Contacts KPIs ──────────────────────────────────────────────────────────────

interface ContactsKpis {
  total: number;
  newThisWeek: number;
}

export function useSupabaseContactsKpis(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<ContactsKpis, Error>({
    queryKey: widgetKeys.contactsKpis(organizationId),
    queryFn: async (): Promise<ContactsKpis> => {
      if (!client) throw new Error("Supabase client not ready");

      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const { data, error } = await client
        .from("contacts")
        .select("created_at")
        .eq("organization_id", organizationId);

      if (error) throw error;

      const contacts = (data ?? []) as { created_at: number }[];

      return {
        total: contacts.length,
        newThisWeek: contacts.filter((c) => c.created_at >= weekAgo).length,
      };
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Companies KPIs ─────────────────────────────────────────────────────────────

interface CompaniesKpis {
  total: number;
  newThisMonth: number;
  totalRevenue: number;
}

export function useSupabaseCompaniesKpis(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<CompaniesKpis, Error>({
    queryKey: widgetKeys.companiesKpis(organizationId),
    queryFn: async (): Promise<CompaniesKpis> => {
      if (!client) throw new Error("Supabase client not ready");

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [companiesRes, leadsRes] = await Promise.all([
        client
          .from("companies")
          .select("created_at")
          .eq("organization_id", organizationId),
        client
          .from("leads")
          .select("value")
          .eq("organization_id", organizationId)
          .eq("status", "won"),
      ]);

      if (companiesRes.error) throw companiesRes.error;
      if (leadsRes.error) throw leadsRes.error;

      const companies = (companiesRes.data ?? []) as { created_at: number }[];
      const wonLeads = (leadsRes.data ?? []) as { value: number | null }[];

      return {
        total: companies.length,
        newThisMonth: companies.filter((c) => c.created_at >= monthStart.getTime()).length,
        totalRevenue: wonLeads.reduce((s, l) => s + (l.value ?? 0), 0),
      };
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Inbox KPIs ─────────────────────────────────────────────────────────────────

interface InboxKpis {
  unread: number;
  todayReceived: number;
}

export function useSupabaseInboxKpis(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<InboxKpis, Error>({
    queryKey: widgetKeys.inboxKpis(organizationId),
    queryFn: async (): Promise<InboxKpis> => {
      if (!client) throw new Error("Supabase client not ready");

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = (await (client as any)
        .from("emails")
        .select("is_read, direction, sent_at")
        .eq("organization_id", organizationId)) as {
        data: Array<{
          is_read: boolean;
          direction: string;
          sent_at: number;
        }> | null;
        error: Error | null;
      };

      if (error) throw error;

      const emails = data ?? [];

      return {
        unread: emails.filter((e) => !e.is_read && e.direction === "inbound").length,
        todayReceived: emails.filter(
          (e) => e.direction === "inbound" && e.sent_at >= todayStart.getTime(),
        ).length,
      };
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Calls KPIs ─────────────────────────────────────────────────────────────────

interface CallsKpis {
  todayCount: number;
  answerRate: number;
  avgDurationSec: number;
}

export function useSupabaseCallsKpis(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<CallsKpis, Error>({
    queryKey: widgetKeys.callsKpis(organizationId),
    queryFn: async (): Promise<CallsKpis> => {
      if (!client) throw new Error("Supabase client not ready");

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await client
        .from("calls")
        .select("outcome, call_date, duration")
        .eq("organization_id", organizationId)
        .gte("call_date", todayStart.getTime());

      if (error) throw error;

      const calls = (data ?? []) as {
        outcome: string;
        call_date: number;
        duration: number | null;
      }[];

      const answered = calls.filter((c) => c.outcome === "movedConversationForward");
      const withDuration = calls.filter((c) => c.duration != null && c.duration > 0);
      const avgDuration =
        withDuration.length > 0
          ? Math.round(
              withDuration.reduce((s, c) => s + (c.duration ?? 0), 0) / withDuration.length,
            )
          : 0;

      return {
        todayCount: calls.length,
        answerRate:
          calls.length > 0 ? Math.round((answered.length / calls.length) * 100) : 0,
        avgDurationSec: avgDuration,
      };
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Products KPIs ──────────────────────────────────────────────────────────────

interface ProductsKpis {
  total: number;
  inDeals: number;
  topSeller: string;
  topSellerCount: number;
}

export function useSupabaseProductsKpis(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<ProductsKpis, Error>({
    queryKey: widgetKeys.productsKpis(organizationId),
    queryFn: async (): Promise<ProductsKpis> => {
      if (!client) throw new Error("Supabase client not ready");

      const [productsRes, dealProductsRes] = await Promise.all([
        client
          .from("products")
          .select("id, name")
          .eq("organization_id", organizationId),
        client
          .from("deal_products")
          .select("product_id")
          .eq("organization_id", organizationId),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (dealProductsRes.error) throw dealProductsRes.error;

      const products = (productsRes.data ?? []) as { id: string; name: string }[];
      const dealProducts = (dealProductsRes.data ?? []) as { product_id: string }[];

      const usageCount = new Map<string, number>();
      for (const dp of dealProducts) {
        usageCount.set(dp.product_id, (usageCount.get(dp.product_id) ?? 0) + 1);
      }

      let topSeller = "";
      let topCount = 0;
      for (const [pid, count] of usageCount) {
        if (count > topCount) {
          topCount = count;
          const p = products.find((p) => p.id === pid);
          topSeller = p?.name ?? "";
        }
      }

      return {
        total: products.length,
        inDeals: usageCount.size,
        topSeller,
        topSellerCount: topCount,
      };
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Leads by Stage ─────────────────────────────────────────────────────────────

const STAGE_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-pink-500",
];

interface LeadsByStageItem {
  label: string;
  count: number;
  color: string;
}

export function useSupabaseLeadsByStage(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<LeadsByStageItem[], Error>({
    queryKey: widgetKeys.leadsByStage(organizationId),
    queryFn: async (): Promise<LeadsByStageItem[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const [stagesRes, leadsRes] = await Promise.all([
        client
          .from("pipeline_stages")
          .select("id, name, color, order")
          .eq("organization_id", organizationId)
          .order("order", { ascending: true }),
        client
          .from("leads")
          .select("pipeline_stage_id")
          .eq("organization_id", organizationId)
          .eq("status", "open"),
      ]);

      if (stagesRes.error) throw stagesRes.error;
      if (leadsRes.error) throw leadsRes.error;

      const stages = (stagesRes.data ?? []) as {
        id: string;
        name: string;
        color: string | null;
        order: number;
      }[];
      const leads = (leadsRes.data ?? []) as { pipeline_stage_id: string | null }[];

      const countByStage = new Map<string, number>();
      for (const l of leads) {
        if (l.pipeline_stage_id) {
          countByStage.set(
            l.pipeline_stage_id,
            (countByStage.get(l.pipeline_stage_id) ?? 0) + 1,
          );
        }
      }

      return stages
        .map((stage, i) => ({
          label: stage.name,
          count: countByStage.get(stage.id) ?? 0,
          color: stage.color ?? STAGE_COLORS[i % STAGE_COLORS.length],
        }))
        .filter((s) => s.count > 0);
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Contacts by Source ─────────────────────────────────────────────────────────

const SOURCE_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
];

interface ContactsBySourceItem {
  label: string;
  count: number;
  pct: number;
  color: string;
}

export function useSupabaseContactsBySource(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<ContactsBySourceItem[], Error>({
    queryKey: widgetKeys.contactsBySource(organizationId),
    queryFn: async (): Promise<ContactsBySourceItem[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("contacts")
        .select("source")
        .eq("organization_id", organizationId);

      if (error) throw error;

      const contacts = (data ?? []) as { source: string | null }[];

      const sourceCounts = new Map<string, number>();
      for (const c of contacts) {
        const src = c.source ?? "unknown";
        sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
      }

      const entries = Array.from(sourceCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

      const total = entries.reduce((s, [, c]) => s + c, 0) || 1;

      return entries.map(([label, count], i) => ({
        label,
        count,
        pct: Math.round((count / total) * 100),
        color: SOURCE_COLORS[i % SOURCE_COLORS.length],
      }));
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Top Products ───────────────────────────────────────────────────────────────

export function useSupabaseTopProducts(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<Array<{ label: string; value: number }>, Error>({
    queryKey: widgetKeys.topProducts(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const [productsRes, dealProductsRes] = await Promise.all([
        client
          .from("products")
          .select("id, name")
          .eq("organization_id", organizationId),
        client
          .from("deal_products")
          .select("product_id")
          .eq("organization_id", organizationId),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (dealProductsRes.error) throw dealProductsRes.error;

      const products = (productsRes.data ?? []) as { id: string; name: string }[];
      const dealProducts = (dealProductsRes.data ?? []) as { product_id: string }[];

      const usageCount = new Map<string, number>();
      for (const dp of dealProducts) {
        usageCount.set(dp.product_id, (usageCount.get(dp.product_id) ?? 0) + 1);
      }

      return products
        .filter((p) => (usageCount.get(p.id) ?? 0) > 0)
        .map((p) => ({ label: p.name, value: usageCount.get(p.id)! }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Top Companies ──────────────────────────────────────────────────────────────

export function useSupabaseTopCompanies(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<Array<{ label: string; value: number }>, Error>({
    queryKey: widgetKeys.topCompanies(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const [companiesRes, leadsRes] = await Promise.all([
        client
          .from("companies")
          .select("id, name")
          .eq("organization_id", organizationId),
        client
          .from("leads")
          .select("company_id, value")
          .eq("organization_id", organizationId)
          .eq("status", "won"),
      ]);

      if (companiesRes.error) throw companiesRes.error;
      if (leadsRes.error) throw leadsRes.error;

      const companies = (companiesRes.data ?? []) as { id: string; name: string }[];
      const wonLeads = (leadsRes.data ?? []) as {
        company_id: string | null;
        value: number | null;
      }[];

      const companyRevenue = new Map<string, number>();
      for (const l of wonLeads) {
        if (l.company_id) {
          companyRevenue.set(l.company_id, (companyRevenue.get(l.company_id) ?? 0) + (l.value ?? 0));
        }
      }

      return companies
        .filter((c) => (companyRevenue.get(c.id) ?? 0) > 0)
        .map((c) => ({ label: c.name, value: companyRevenue.get(c.id)! }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Weekly Contacts Trend ──────────────────────────────────────────────────────

export function useSupabaseWeeklyContactsTrend(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<Array<{ day: string; value: number }>, Error>({
    queryKey: widgetKeys.weeklyContactsTrend(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const days = buildWeekDays();
      const weekStart = days[0]._start;

      const { data, error } = await client
        .from("contacts")
        .select("created_at")
        .eq("organization_id", organizationId)
        .gte("created_at", weekStart);

      if (error) throw error;

      const contacts = (data ?? []) as { created_at: number }[];

      return days.map(({ day, _start, _end }) => ({
        day,
        value: contacts.filter((c) => c.created_at >= _start && c.created_at < _end).length,
      }));
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Weekly Companies Trend ─────────────────────────────────────────────────────

export function useSupabaseWeeklyCompaniesTrend(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<Array<{ day: string; value: number }>, Error>({
    queryKey: widgetKeys.weeklyCompaniesTrend(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const days = buildWeekDays();
      const weekStart = days[0]._start;

      const { data, error } = await client
        .from("companies")
        .select("created_at")
        .eq("organization_id", organizationId)
        .gte("created_at", weekStart);

      if (error) throw error;

      const companies = (data ?? []) as { created_at: number }[];

      return days.map(({ day, _start, _end }) => ({
        day,
        value: companies.filter((c) => c.created_at >= _start && c.created_at < _end).length,
      }));
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Weekly Deals Trend ─────────────────────────────────────────────────────────

export function useSupabaseWeeklyDealsTrend(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<Array<{ day: string; created: number; won: number }>, Error>({
    queryKey: widgetKeys.weeklyDealsTrend(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const days = buildWeekDays();
      const weekStart = days[0]._start;

      const { data, error } = await client
        .from("leads")
        .select("created_at, status, won_at, updated_at")
        .eq("organization_id", organizationId)
        .gte("created_at", weekStart);

      if (error) throw error;

      const leads = (data ?? []) as {
        created_at: number;
        status: string;
        won_at: number | null;
        updated_at: number;
      }[];

      const recentWon = leads.filter(
        (l) => l.status === "won" && (l.won_at ?? l.updated_at) >= weekStart,
      );

      return days.map(({ day, _start, _end }) => ({
        day,
        created: leads.filter((l) => l.created_at >= _start && l.created_at < _end).length,
        won: recentWon.filter(
          (l) => (l.won_at ?? l.updated_at) >= _start && (l.won_at ?? l.updated_at) < _end,
        ).length,
      }));
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Weekly Calls Trend ─────────────────────────────────────────────────────────

export function useSupabaseWeeklyCallsTrend(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<Array<{ day: string; value: number }>, Error>({
    queryKey: widgetKeys.weeklyCallsTrend(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const days = buildWeekDays();
      const weekStart = days[0]._start;

      const { data, error } = await client
        .from("calls")
        .select("call_date")
        .eq("organization_id", organizationId)
        .gte("call_date", weekStart);

      if (error) throw error;

      const calls = (data ?? []) as { call_date: number }[];

      return days.map(({ day, _start, _end }) => ({
        day,
        value: calls.filter((c) => c.call_date >= _start && c.call_date < _end).length,
      }));
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Form Documents KPIs ────────────────────────────────────────────────────────

interface FormDocumentsKpis {
  total: number;
  newThisMonth: number;
  pendingSignature: number;
  signed: number;
  signRate: number;
}

export function useSupabaseFormDocumentsKpis(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<FormDocumentsKpis, Error>({
    queryKey: widgetKeys.formDocumentsKpis(organizationId),
    queryFn: async (): Promise<FormDocumentsKpis> => {
      if (!client) throw new Error("Supabase client not ready");

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { data, error } = await (client as any)
        .from("form_documents")
        .select("status, created_at")
        .eq("organization_id", organizationId);

      if (error) throw error;

      const docs = (data ?? []) as { status: string; created_at: number }[];

      const signedCount = docs.filter(
        (d) => d.status === "signed" || d.status === "completed",
      ).length;

      return {
        total: docs.length,
        newThisMonth: docs.filter((d) => d.created_at >= monthStart.getTime()).length,
        pendingSignature: docs.filter((d) => d.status === "pending_signature").length,
        signed: signedCount,
        signRate: docs.length > 0 ? Math.round((signedCount / docs.length) * 100) : 0,
      };
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Form Documents by Status ───────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; order: number }> = {
  draft: { label: "Szkic", color: "bg-slate-400", order: 0 },
  pending_signature: { label: "Do podpisu", color: "bg-amber-500", order: 1 },
  signed: { label: "Podpisane", color: "bg-emerald-500", order: 2 },
  completed: { label: "Zakończone", color: "bg-sky-500", order: 3 },
  expired: { label: "Wygasłe", color: "bg-rose-500", order: 4 },
  voided: { label: "Unieważnione", color: "bg-neutral-500", order: 5 },
};

interface FormDocumentsByStatusItem {
  label: string;
  count: number;
  color: string;
}

export function useSupabaseFormDocumentsByStatus(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<FormDocumentsByStatusItem[], Error>({
    queryKey: widgetKeys.formDocumentsByStatus(organizationId),
    queryFn: async (): Promise<FormDocumentsByStatusItem[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await (client as any)
        .from("form_documents")
        .select("status")
        .eq("organization_id", organizationId);

      if (error) throw error;

      const docs = (data ?? []) as { status: string }[];

      const counts = new Map<string, number>();
      for (const d of docs) {
        counts.set(d.status, (counts.get(d.status) ?? 0) + 1);
      }

      return Array.from(counts.entries())
        .map(([status, count]) => {
          const meta = STATUS_META[status] ?? { label: status, color: "bg-muted", order: 99 };
          return { label: meta.label, count, color: meta.color, _order: meta.order };
        })
        .sort((a, b) => a._order - b._order)
        .map(({ label, count, color }) => ({ label, count, color }));
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Weekly Form Documents Trend ────────────────────────────────────────────────

export function useSupabaseWeeklyFormDocumentsTrend(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<Array<{ day: string; value: number }>, Error>({
    queryKey: widgetKeys.weeklyFormDocumentsTrend(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const days = buildWeekDays();
      const weekStart = days[0]._start;

      const { data, error } = await (client as any)
        .from("form_documents")
        .select("created_at")
        .eq("organization_id", organizationId)
        .gte("created_at", weekStart);

      if (error) throw error;

      const docs = (data ?? []) as { created_at: number }[];

      return days.map(({ day, _start, _end }) => ({
        day,
        value: docs.filter((d) => d.created_at >= _start && d.created_at < _end).length,
      }));
    },
    enabled: isReady && !!organizationId,
  });
}

// ── Top Document Categories ────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  consent: "Zgoda",
  medical_record: "Karta medyczna",
  prescription: "Recepta",
  referral: "Skierowanie",
  contract: "Umowa",
  invoice: "Faktura",
  protocol: "Protokół",
  intake: "Ankieta",
  custom: "Inne",
};

export function useSupabaseTopDocumentCategories(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<Array<{ label: string; value: number }>, Error>({
    queryKey: widgetKeys.topDocumentCategories(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const [docsRes, templatesRes] = await Promise.all([
        (client as any)
          .from("form_documents")
          .select("template_id")
          .eq("organization_id", organizationId),
        (client as any)
          .from("form_templates")
          .select("id, category")
          .eq("organization_id", organizationId),
      ]);

      if (docsRes.error) throw docsRes.error;
      if (templatesRes.error) throw templatesRes.error;

      const docs = (docsRes.data ?? []) as { template_id: string }[];
      const templates = (templatesRes.data ?? []) as {
        id: string;
        category: string;
      }[];

      const templateCategoryMap = new Map(templates.map((t) => [t.id, t.category]));

      const templateCounts = new Map<string, number>();
      for (const d of docs) {
        templateCounts.set(d.template_id, (templateCounts.get(d.template_id) ?? 0) + 1);
      }

      const categoryCounts = new Map<string, number>();
      for (const [templateId, count] of templateCounts) {
        const cat = templateCategoryMap.get(templateId);
        if (!cat) continue;
        categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + count);
      }

      return Array.from(categoryCounts.entries())
        .map(([category, count]) => ({
          label: CATEGORY_LABELS[category] ?? category,
          value: count,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
    },
    enabled: isReady && !!organizationId,
  });
}
