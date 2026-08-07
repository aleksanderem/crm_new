import { createLazyFileRoute } from "@tanstack/react-router";
import Papa from "papaparse";
import { toast } from "sonner";
import { useSupabaseLeadsForReports, useSupabaseStageVelocity } from "@/hooks/use-supabase-leads";
import { useSupabaseSourcesList } from "@/hooks/use-supabase-sources";
import { useSupabaseAllPipelineStages } from "@/hooks/use-supabase-pipelines";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { SidePanel } from "@/components/crm/side-panel";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EllipsisVerticalIcon } from "@/lib/ez-icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import StatisticsOrderCard from "@/components/shadcn-studio/blocks/statistics-order-card";
import StatisticsProfitCard from "@/components/shadcn-studio/blocks/statistics-profit-card";
import StatisticsImpressionCard from "@/components/shadcn-studio/blocks/statistics-impression-card";
import StatisticsSalesGrowthCard from "@/components/shadcn-studio/blocks/statistics-sales-growth-card";

export const Route = createLazyFileRoute(
  "/_app/_auth/dashboard/_layout/reports"
)({
  component: CrmReports,
});

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  won: "var(--chart-2)",
  lost: "var(--chart-5)",
  open: "var(--chart-1)",
};

const SOURCE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "color-mix(in oklab, var(--chart-1) 60%, var(--chart-2))",
  "color-mix(in oklab, var(--chart-2) 60%, var(--chart-3))",
];

type DateRangeKey = "today" | "yesterday" | "7d" | "30d" | "90d" | "365d" | "custom";

function getPresetDateRange(key: Exclude<DateRangeKey, "custom">): {
  startDate: string;
  endDate: string;
} {
  const today = new Date();
  if (key === "today") {
    const iso = today.toISOString().split("T")[0];
    return { startDate: iso, endDate: iso };
  }
  if (key === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const iso = yesterday.toISOString().split("T")[0];
    return { startDate: iso, endDate: iso };
  }
  const past = new Date(today);
  const days = key === "7d" ? 7 : key === "30d" ? 30 : key === "90d" ? 90 : 365;
  past.setDate(past.getDate() - days);
  return {
    startDate: past.toISOString().split("T")[0],
    endDate: today.toISOString().split("T")[0],
  };
}

function getPrevPeriodRange(
  startDate: string,
  endDate: string,
): { startDate: string; endDate: string } {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - diffMs);
  return {
    startDate: prevStart.toISOString().split("T")[0],
    endDate: prevEnd.toISOString().split("T")[0],
  };
}

function formatDays(days: number): string {
  if (days < 1) return "<1d";
  return `${Math.round(days)}d`;
}

function formatValue(v: number, currency: string): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: currency || "PLN",
    maximumFractionDigits: 0,
  }).format(v);
}

function deltaLabel(current: number, prev: number): string {
  if (prev === 0) return current > 0 ? "+100%" : "0%";
  const pct = Math.round(((current - prev) / prev) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

// ── Card menu ──────────────────────────────────────────────────────────────────

function CardMenu() {
  const { t } = useTranslation();
  const items = [t("common.share"), t("common.update"), t("common.refresh")];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-6 rounded-full"
        >
          <EllipsisVerticalIcon className="h-4 w-4" variant="stroke" />
          <span className="sr-only">{t("common.menu")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {items.map((item) => (
            <DropdownMenuItem key={item}>{item}</DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Win Rate Chart ─────────────────────────────────────────────────────────────

const winRateConfig = {
  won: { label: "Won", color: STATUS_COLORS.won },
  lost: { label: "Lost", color: STATUS_COLORS.lost },
  open: { label: "Open", color: STATUS_COLORS.open },
} satisfies ChartConfig;

function WinRateChart({ won, lost, open }: { won: number; lost: number; open: number }) {
  const { t } = useTranslation();
  const total = won + lost + open;
  const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;
  const data = [
    { name: t("crm.reports.won"), value: won, fill: STATUS_COLORS.won },
    { name: t("crm.reports.lost"), value: lost, fill: STATUS_COLORS.lost },
    { name: t("crm.reports.open"), value: open, fill: STATUS_COLORS.open },
  ].filter((d) => d.value > 0);

  if (total === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
        {t("crm.reports.noData")}
      </div>
    );
  }

  return (
    <ChartContainer config={winRateConfig} className="mx-auto max-h-52 w-full">
      <PieChart>
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} strokeWidth={5}>
          <Label
            content={({ viewBox }) => {
              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan
                      x={viewBox.cx}
                      y={viewBox.cy}
                      className="fill-foreground text-2xl font-bold"
                    >
                      {winRate}%
                    </tspan>
                    <tspan
                      x={viewBox.cx}
                      y={(viewBox.cy ?? 0) + 22}
                      className="fill-muted-foreground text-xs"
                    >
                      {t("crm.reports.winRate")}
                    </tspan>
                  </text>
                );
              }
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

// ── Revenue by Source Chart ────────────────────────────────────────────────────

function RevenueBySourceChart({
  data,
}: {
  data: { source: string; value: number; count: number }[];
}) {
  const { t } = useTranslation();

  const chartConfig = Object.fromEntries(
    data.map((d, i) => [
      d.source,
      { label: d.source, color: SOURCE_COLORS[i % SOURCE_COLORS.length] },
    ]),
  ) satisfies ChartConfig;

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
        {t("crm.reports.noData")}
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-52 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="source"
          tickLine={false}
          axisLine={false}
          width={90}
          tick={{ fontSize: 12 }}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar dataKey="value" radius={4}>
          {data.map((entry, index) => (
            <Cell key={entry.source} fill={SOURCE_COLORS[index % SOURCE_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// ── Deals by Stage Chart ───────────────────────────────────────────────────────

const dealsByStageConfig = {
  count: { label: "Deals", color: "var(--chart-1)" },
} satisfies ChartConfig;

function DealsByStageChart({
  data,
}: {
  data: { stage: string; count: number; value: number }[];
}) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
        {t("crm.reports.noData")}
      </div>
    );
  }

  return (
    <ChartContainer config={dealsByStageConfig} className="h-52 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="stage"
          tickLine={false}
          axisLine={false}
          width={110}
          tick={{ fontSize: 12 }}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--chart-1)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

// ── Monthly Trend Chart ────────────────────────────────────────────────────────

const trendConfig = {
  won: { label: "Won", color: STATUS_COLORS.won },
  created: { label: "Created", color: "var(--chart-1)" },
} satisfies ChartConfig;

function MonthlyTrendChart({
  data,
}: {
  data: { month: string; won: number; created: number }[];
}) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
        {t("crm.reports.noData")}
      </div>
    );
  }

  return (
    <ChartContainer config={trendConfig} className="h-52 w-full">
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar dataKey="created" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="won" fill={STATUS_COLORS.won} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

// ── Funnel Velocity Chart ──────────────────────────────────────────────────────

const funnelVelocityConfig = {
  avgDays: { label: "Avg days", color: "var(--chart-3)" },
} satisfies ChartConfig;

function FunnelVelocityChart({
  data,
}: {
  data: { stage: string; avgDays: number; sampleCount: number }[];
}) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
        {t("crm.reports.noData")}
      </div>
    );
  }

  return (
    <ChartContainer config={funnelVelocityConfig} className="h-52 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
        <CartesianGrid horizontal={false} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatDays(v)}
        />
        <YAxis
          type="category"
          dataKey="stage"
          tickLine={false}
          axisLine={false}
          width={110}
          tick={{ fontSize: 12 }}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent formatter={(v) => [`${formatDays(Number(v))}`, ""]} />}
        />
        <Bar dataKey="avgDays" fill="var(--chart-3)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

function CrmReports() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [rangeKey, setRangeKey] = useState<DateRangeKey>("30d");
  const [showComparison, setShowComparison] = useState(false);

  const { startDate, endDate } = useMemo(() => {
    if (rangeKey === "custom" && customStart && customEnd) {
      return { startDate: customStart, endDate: customEnd };
    }
    if (rangeKey === "custom") {
      return getPresetDateRange("30d");
    }
    return getPresetDateRange(rangeKey);
  }, [rangeKey, customStart, customEnd]);

  const prevPeriod = useMemo(() => getPrevPeriodRange(startDate, endDate), [startDate, endDate]);

  const rangeLabel = useMemo(() => {
    const labels: Record<DateRangeKey, string> = {
      today: t("gabinet.reports.today"),
      yesterday: t("gabinet.reports.yesterday"),
      "7d": t("gabinet.reports.last7days"),
      "30d": t("crm.reports.last30days"),
      "90d": t("gabinet.reports.last90days"),
      "365d": t("gabinet.reports.lastYear"),
      custom: `${startDate} — ${endDate}`,
    };
    return labels[rangeKey] ?? t("crm.reports.last30days");
  }, [rangeKey, startDate, endDate, t]);

  const { data: leads, isLoading: loadingLeads } = useSupabaseLeadsForReports(
    organizationId,
    { startDate, endDate, enabled: !!organizationId },
  );

  const { data: prevLeads } = useSupabaseLeadsForReports(
    organizationId,
    {
      startDate: prevPeriod.startDate,
      endDate: prevPeriod.endDate,
      enabled: !!organizationId && showComparison,
    },
  );

  const { data: sources } = useSupabaseSourcesList(organizationId);
  const { data: stages } = useSupabaseAllPipelineStages(organizationId);

  const { data: stageVelocityRaw, isLoading: loadingVelocity } = useSupabaseStageVelocity(
    organizationId,
    { startDate, endDate, enabled: !!organizationId },
  );

  const sourceNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sources ?? []) map.set(s._id, s.name);
    return map;
  }, [sources]);

  const stageNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stages ?? []) map.set(s._id, s.name);
    return map;
  }, [stages]);

  // ── KPIs ────────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const all = leads ?? [];
    const prevAll = prevLeads ?? [];

    const won = all.filter((l) => l.status === "won");
    const lost = all.filter((l) => l.status === "lost");
    const open = all.filter((l) => l.status !== "won" && l.status !== "lost");

    const totalValue = all.reduce((s, l) => s + (l.value ?? 0), 0);
    const wonValue = won.reduce((s, l) => s + (l.value ?? 0), 0);
    const closedCount = won.length + lost.length;
    const winRate = closedCount > 0 ? (won.length / closedCount) * 100 : 0;

    const cycleTimes = won
      .map((l) => ((l.wonAt ?? l.updatedAt) - l.createdAt) / (1000 * 60 * 60 * 24))
      .filter((d) => d > 0);
    const avgCycleTime =
      cycleTimes.length > 0 ? cycleTimes.reduce((s, d) => s + d, 0) / cycleTimes.length : 0;

    const prevWon = prevAll.filter((l) => l.status === "won");
    const prevLost = prevAll.filter((l) => l.status === "lost");
    const prevClosed = prevWon.length + prevLost.length;
    const prevWinRate = prevClosed > 0 ? (prevWon.length / prevClosed) * 100 : 0;
    const prevTotalValue = prevAll.reduce((s, l) => s + (l.value ?? 0), 0);
    const prevCycleTimes = prevWon
      .map((l) => ((l.wonAt ?? l.updatedAt) - l.createdAt) / (1000 * 60 * 60 * 24))
      .filter((d) => d > 0);
    const prevAvgCycle =
      prevCycleTimes.length > 0
        ? prevCycleTimes.reduce((s, d) => s + d, 0) / prevCycleTimes.length
        : 0;

    const defaultCurrency =
      won.find((l) => l.currency)?.currency ?? all.find((l) => l.currency)?.currency ?? "PLN";

    return {
      total: all.length,
      won: won.length,
      lost: lost.length,
      open: open.length,
      totalValue,
      wonValue,
      winRate,
      avgCycleTime,
      defaultCurrency,
      prevTotal: prevAll.length,
      prevWinRate,
      prevTotalValue,
      prevAvgCycle,
    };
  }, [leads, prevLeads]);

  // ── Chart Data ───────────────────────────────────────────────────────────────

  const revenueBySource = useMemo(() => {
    const map = new Map<string, { value: number; count: number }>();
    for (const lead of leads ?? []) {
      const sourceName =
        sourceNameMap.get(lead.source ?? "") || lead.source || t("crm.reports.noSource");
      const existing = map.get(sourceName) ?? { value: 0, count: 0 };
      map.set(sourceName, { value: existing.value + (lead.value ?? 0), count: existing.count + 1 });
    }
    return [...map.entries()]
      .map(([source, { value, count }]) => ({ source, value, count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [leads, sourceNameMap, t]);

  const dealsByStage = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    for (const lead of leads ?? []) {
      if (!lead.pipelineStageId) continue;
      const stageName = stageNameMap.get(lead.pipelineStageId) ?? lead.pipelineStageId;
      const existing = map.get(stageName) ?? { count: 0, value: 0 };
      map.set(stageName, { count: existing.count + 1, value: existing.value + (lead.value ?? 0) });
    }
    return [...map.entries()]
      .map(([stage, { count, value }]) => ({ stage, count, value }))
      .sort((a, b) => b.count - a.count);
  }, [leads, stageNameMap]);

  const monthlyTrend = useMemo(() => {
    const map = new Map<string, { won: number; created: number }>();
    for (const lead of leads ?? []) {
      const d = new Date(lead.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const existing = map.get(key) ?? { won: 0, created: 0 };
      map.set(key, {
        won: existing.won + (lead.status === "won" ? 1 : 0),
        created: existing.created + 1,
      });
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, { won, created }]) => {
        const [year, month] = key.split("-");
        return { month: `${parseInt(month)}/${year.slice(2)}`, won, created };
      });
  }, [leads]);

  const funnelVelocity = useMemo(() => {
    return (stageVelocityRaw ?? [])
      .map(({ stageId, avgDays, sampleCount }) => ({
        stage: stageNameMap.get(stageId) ?? stageId,
        avgDays,
        sampleCount,
      }))
      .sort((a, b) => b.avgDays - a.avgDays);
  }, [stageVelocityRaw, stageNameMap]);

  // ── KPI Sparklines ──────────────────────────────────────────────────────────

  const sparklines = useMemo(() => {
    const days = new Map<string, { created: number; won: number }>();
    for (const lead of leads ?? []) {
      const key = new Date(lead.createdAt).toISOString().split("T")[0];
      const existing = days.get(key) ?? { created: 0, won: 0 };
      days.set(key, {
        created: existing.created + 1,
        won: existing.won + (lead.status === "won" ? 1 : 0),
      });
    }
    const sorted = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
    return {
      created: sorted.map(([, v], i) => ({ day: String(i), orders: v.created })),
      won: sorted.map(([, v], i) => ({ date: String(i), sales: v.won })),
      value: sorted.map(([, v], i) => ({ month: String(i), profit: v.created })),
      impression: sorted.map(([, v], i) => ({ month: String(i), impression: v.created })),
    };
  }, [leads]);

  // ── CSV Export ──────────────────────────────────────────────────────────────

  const handleExportCsv = useCallback(() => {
    const rows = (leads ?? []).map((l) => ({
      id: l._id,
      title: l.title,
      status: l.status,
      value: l.value ?? "",
      currency: l.currency ?? "",
      source: sourceNameMap.get(l.source ?? "") ?? l.source ?? "",
      stage: stageNameMap.get(l.pipelineStageId ?? "") ?? l.pipelineStageId ?? "",
      created_at: new Date(l.createdAt).toISOString(),
      won_at: l.wonAt ? new Date(l.wonAt).toISOString() : "",
      lost_at: l.lostAt ? new Date(l.lostAt).toISOString() : "",
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crm-reports-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("crm.reports.exportSuccess"));
  }, [leads, sourceNameMap, stageNameMap, startDate, endDate, t]);

  // ── Sidebar Dispatch Hooks ──────────────────────────────────────────────────

  useSidebarDispatch("filterByDate", () => setFilterPanelOpen(true));
  useSidebarDispatch("exportReport", handleExportCsv);

  const handleApplyCustomRange = useCallback(() => {
    if (customStart && customEnd) setRangeKey("custom");
    setFilterPanelOpen(false);
  }, [customStart, customEnd]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title={t("crm.reports.title")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as DateRangeKey)}>
              <SelectTrigger className="h-8 w-36 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">{t("gabinet.reports.today")}</SelectItem>
                <SelectItem value="yesterday">{t("gabinet.reports.yesterday")}</SelectItem>
                <SelectItem value="7d">{t("gabinet.reports.last7days")}</SelectItem>
                <SelectItem value="30d">{t("crm.reports.last30days")}</SelectItem>
                <SelectItem value="90d">{t("gabinet.reports.last90days")}</SelectItem>
                <SelectItem value="365d">{t("gabinet.reports.lastYear")}</SelectItem>
                <SelectItem value="custom">{t("crm.reports.customRange")}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={showComparison ? "default" : "outline"}
              size="sm"
              className="h-8 text-sm"
              onClick={() => setShowComparison((v) => !v)}
            >
              {t("crm.reports.comparePeriod")}
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-sm" onClick={handleExportCsv}>
              {t("crm.reports.exportCsv")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-sm"
              onClick={() => window.print()}
            >
              {t("crm.reports.exportPdf")}
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      {loadingLeads ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatisticsOrderCard
            title={t("crm.reports.totalDeals")}
            description={rangeLabel}
            value={kpis.total.toLocaleString()}
            changePercentage={
              showComparison
                ? deltaLabel(kpis.total, kpis.prevTotal)
                : `${kpis.open} ${t("crm.reports.open")}`
            }
            chartData={sparklines.created}
          />
          <StatisticsSalesGrowthCard
            title={t("crm.reports.wonDeals")}
            description={`${Math.round(kpis.winRate)}% ${t("crm.reports.winRate")}`}
            value={kpis.won.toLocaleString()}
            changePercentage={
              showComparison
                ? deltaLabel(kpis.winRate, kpis.prevWinRate)
                : `${kpis.won}/${kpis.won + kpis.lost} ${t("crm.reports.closed")}`
            }
            chartData={sparklines.won}
            gradientId="fillWon"
          />
          <StatisticsProfitCard
            title={t("crm.reports.pipelineValue")}
            description={rangeLabel}
            value={formatValue(kpis.totalValue, kpis.defaultCurrency)}
            changePercentage={
              showComparison
                ? deltaLabel(kpis.totalValue, kpis.prevTotalValue)
                : `${formatValue(kpis.wonValue, kpis.defaultCurrency)} ${t("crm.reports.won")}`
            }
            chartData={sparklines.value}
          />
          <StatisticsImpressionCard
            title={t("crm.reports.avgCycleTime")}
            description={t("crm.reports.wonDealsOnly")}
            value={kpis.avgCycleTime > 0 ? formatDays(kpis.avgCycleTime) : "—"}
            changePercentage={
              showComparison && kpis.prevAvgCycle > 0
                ? deltaLabel(kpis.avgCycleTime, kpis.prevAvgCycle)
                : t("crm.reports.daysToDeal")
            }
            chartData={sparklines.impression}
          />
        </div>
      )}

      {/* Win Rate + Revenue by Source */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex justify-between border-b">
            <span className="text-lg font-semibold">{t("crm.reports.winRateTitle")}</span>
            <CardMenu />
          </CardHeader>
          <CardContent className="pt-4">
            {loadingLeads ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <>
                <WinRateChart won={kpis.won} lost={kpis.lost} open={kpis.open} />
                <div className="mt-4 flex justify-center gap-6 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: STATUS_COLORS.won }}
                    />
                    {t("crm.reports.won")} ({kpis.won})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: STATUS_COLORS.lost }}
                    />
                    {t("crm.reports.lost")} ({kpis.lost})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: STATUS_COLORS.open }}
                    />
                    {t("crm.reports.open")} ({kpis.open})
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex justify-between border-b">
            <span className="text-lg font-semibold">{t("crm.reports.revenueBySource")}</span>
            <CardMenu />
          </CardHeader>
          <CardContent className="pt-4">
            {loadingLeads ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <RevenueBySourceChart data={revenueBySource} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deals by Stage + Monthly Trend */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex justify-between border-b">
            <span className="text-lg font-semibold">{t("crm.reports.dealsByStage")}</span>
            <CardMenu />
          </CardHeader>
          <CardContent className="pt-4">
            {loadingLeads ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <DealsByStageChart data={dealsByStage} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex justify-between border-b">
            <span className="text-lg font-semibold">{t("crm.reports.monthlyTrend")}</span>
            <CardMenu />
          </CardHeader>
          <CardContent className="pt-4">
            {loadingLeads ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <MonthlyTrendChart data={monthlyTrend} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Funnel Velocity */}
      <Card>
        <CardHeader className="flex justify-between border-b">
          <div>
            <span className="text-lg font-semibold">{t("crm.reports.funnelVelocity")}</span>
            <p className="text-sm text-muted-foreground">{t("crm.reports.avgDaysPerStage")}</p>
          </div>
          <CardMenu />
        </CardHeader>
        <CardContent className="pt-4">
          {loadingVelocity ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <FunnelVelocityChart data={funnelVelocity} />
          )}
        </CardContent>
      </Card>

      {/* Custom Date Range Panel */}
      <SidePanel
        open={filterPanelOpen}
        onOpenChange={setFilterPanelOpen}
        title={t("crm.reports.customRange")}
        onSubmit={handleApplyCustomRange}
        submitLabel={t("common.apply", "Apply")}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <FieldLabel>{t("crm.reports.startDate")}</FieldLabel>
            <Input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>{t("crm.reports.endDate")}</FieldLabel>
            <Input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
        </div>
      </SidePanel>
    </div>
  );
}
