import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { Id } from "@cvx/_generated/dataModel";
import { PageHeader } from "@/components/layout/page-header";
import { CrmPipelineChart } from "@/components/dashboard/crm-pipeline-chart";
import { UpcomingActivities } from "@/components/dashboard/upcoming-activities";
import { TopPerformers } from "@/components/dashboard/top-performers";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChartConfig } from "@/components/ui/chart";
import { useDateRange } from "@/components/crm/date-range-context";

// shadcn/studio blocks – used directly
import TotalIncomeCard from "@/components/shadcn-studio/blocks/chart-total-income";
import EarningReportCard from "@/components/shadcn-studio/blocks/chart-earning-report";
import ConversionRateCard from "@/components/shadcn-studio/blocks/chart-conversion-rate";
import TotalOrdersCard from "@/components/shadcn-studio/blocks/chart-total-orders";

// statistics blocks
import StatisticsOrderCard from "@/components/shadcn-studio/blocks/statistics-order-card";
import StatisticsSalesGrowthCard from "@/components/shadcn-studio/blocks/statistics-sales-growth-card";
import StatisticsProfitCard from "@/components/shadcn-studio/blocks/statistics-profit-card";
import StatisticsImpressionCard from "@/components/shadcn-studio/blocks/statistics-impression-card";
import StatisticsUserReachCard from "@/components/shadcn-studio/blocks/statistics-user-reach-card";

import {
  CircleDollarSignIcon,
  CreditCardIcon,
  WalletIcon,
  Trophy,
  DollarSign,
  CheckCircle,
} from "@/lib/ez-icons";

export const Route = createFileRoute("/_app/_auth/dashboard/_layout/")({
  component: DashboardIndex,
});

function fmtCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function fmtNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

const DONUT_COLORS = [
  "var(--primary)",
  "color-mix(in oklab, var(--primary) 70%, transparent)",
  "color-mix(in oklab, var(--primary) 50%, transparent)",
  "color-mix(in oklab, var(--primary) 35%, transparent)",
  "color-mix(in oklab, var(--primary) 20%, transparent)",
];

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "other"
  );
}

/** Build TotalOrdersCard props from a label/value array */
function buildDonutProps(
  data: { label: string; value: number }[],
  title: string,
  subtitle: string,
  totalLabel: string
) {
  const top = data.slice(0, 5);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const topPct =
    total > 0
      ? Math.round((top.reduce((s, d) => s + d.value, 0) / total) * 100)
      : 0;

  const config: ChartConfig = { order: { label: "Count" } };
  const chartData = top.map((item, i) => {
    const key = slugify(item.label);
    config[key] = {
      label: item.label,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    };
    return { month: key, order: item.value, fill: `var(--color-${key})` };
  });

  const listData = top.map((item, i) => ({
    icon: (
      <div
        className="size-4 rounded-full"
        style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
      />
    ),
    title: item.label,
    department:
      total > 0
        ? `${Math.round((item.value / total) * 100)}% of total`
        : "0%",
    value: item.value.toLocaleString(),
  }));

  return {
    title,
    subtitle: `${total.toLocaleString()} ${subtitle}`,
    totalValue: total.toLocaleString(),
    totalLabel,
    centerLabel: `${topPct}%`,
    centerSublabel: `Top ${top.length}`,
    chartData,
    chartConfig: config,
    listData,
  };
}

function DashboardIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const { timeRange } = useDateRange();

  // --- Auto-seed defaults for existing orgs ---
  const { data: sources } = useQuery(
    convexQuery(api.sources.list, { organizationId })
  );
  const { mutate: seedAll } = useMutation({
    mutationFn: useConvexMutation(api.seedDefaults.seedAll),
  });
  const seeded = useRef(false);
  useEffect(() => {
    if (sources && sources.length === 0 && !seeded.current) {
      seeded.current = true;
      seedAll({ organizationId });
    }
  }, [sources, organizationId, seedAll]);

  // --- KPI + stats ---
  const { data: stats, isLoading: statsLoading } = useQuery(
    convexQuery(api.dashboard.getStats, { organizationId })
  );

  // --- Pipeline stages ---
  const { data: pipelines } = useQuery(
    convexQuery(api.pipelines.list, { organizationId })
  );
  const defaultPipeline = pipelines?.find((p) => p.isDefault) ?? pipelines?.[0];
  const { data: stageData } = useQuery({
    ...convexQuery(api.dashboard.getLeadsByStage, {
      organizationId,
      pipelineId: defaultPipeline?._id ?? ("" as Id<"pipelines">),
    }),
    enabled: !!defaultPipeline,
  });

  // --- Chart data ---
  const { data: wonDealsData } = useQuery(
    convexQuery(api.dashboard.getWonDealsByDay, {
      organizationId,
      timeRange,
    })
  );
  const { data: revenueData } = useQuery(
    convexQuery(api.dashboard.getRevenueByMonth, {
      organizationId,
      timeRange,
    })
  );
  const { data: contactsSourceData } = useQuery(
    convexQuery(api.dashboard.getContactsBySource, {
      organizationId,
      timeRange,
    })
  );
  const { data: callOutcomesData } = useQuery(
    convexQuery(api.dashboard.getCallOutcomeOverview, {
      organizationId,
      timeRange,
    })
  );

  // --- Bottom sections ---
  const { data: performersData } = useQuery(
    convexQuery(api.dashboard.getTopPerformers, {
      organizationId,
      timeRange,
    })
  );
  const { data: upcomingData } = useQuery(
    convexQuery(api.dashboard.getUpcomingActivities, { organizationId })
  );

  // --- Transform data for shadcn/studio blocks ---

  // TotalIncomeCard: revenue area chart + summary sidebar
  const revenueChartData = useMemo(
    () =>
      (revenueData ?? []).map((d) => ({ day: d.label, incomes: d.value })),
    [revenueData]
  );

  const revenueReportData = useMemo(
    () => [
      {
        icons: <WalletIcon className="text-chart-2 size-6 stroke-[1.5]" />,
        title: "Pipeline",
        amount: fmtCurrency(stats?.pipelineValue ?? 0),
        change: fmtCurrency(stats?.pipelineValue ?? 0),
      },
      {
        icons: <CreditCardIcon className="text-chart-1 size-6 stroke-[1.5]" />,
        title: t("dashboard.wonRevenue"),
        amount: fmtCurrency(stats?.wonValue ?? 0),
        change: fmtCurrency(stats?.wonValue ?? 0),
      },
      {
        icons: (
          <CircleDollarSignIcon className="text-chart-5 size-6 stroke-[1.5]" />
        ),
        title: "Win Rate",
        amount: `${Math.round((stats?.winRate ?? 0) * 100)}%`,
        change: `${Math.round((stats?.winRate ?? 0) * 100)}%`,
      },
    ],
    [stats, t]
  );

  // EarningReportCard: won deals bar chart + stat rows
  const wonCount = stats?.wonLeads ?? 0;
  const wonRevenue = stats?.wonValue ?? 0;
  const avgDealSize = wonCount > 0 ? wonRevenue / wonCount : 0;

  const dealsStatData = useMemo(
    () => [
      {
        icon: <Trophy className="size-5" />,
        title: t("dashboard.wonDeals"),
        department: "Total closed",
        value: wonCount.toLocaleString(),
        trend: "up",
        percentage: 100,
      },
      {
        icon: <DollarSign className="size-5" />,
        title: "Avg Deal Size",
        department: "Per deal",
        value: fmtCurrency(avgDealSize),
        trend: avgDealSize > 0 ? "up" : "down",
        percentage: 0,
      },
      {
        icon: <CheckCircle className="size-5" />,
        title: t("dashboard.wonRevenue"),
        department: "Total value",
        value: fmtCurrency(wonRevenue),
        trend: wonRevenue > 0 ? "up" : "down",
        percentage: 0,
      },
    ],
    [wonCount, avgDealSize, wonRevenue, t]
  );

  const dealsChartData = useMemo(
    () =>
      (wonDealsData ?? []).map((d) => ({
        day: d.label,
        earning: d.value,
        fill: "var(--chart-2)",
      })),
    [wonDealsData]
  );

  // ConversionRateCard: win rate sparkline + won/lost stats
  const winPct = Math.round((stats?.winRate ?? 0) * 100);
  const totalClosed = (stats?.wonLeads ?? 0) + (stats?.lostLeads ?? 0);

  const conversionChartData = useMemo(
    () =>
      (revenueData ?? []).map((d) => ({
        month: d.label,
        conversion: d.value,
      })),
    [revenueData]
  );

  const conversionData = useMemo(
    () => [
      {
        title: t("dashboard.wonDeals"),
        stat: `${stats?.wonLeads ?? 0} deals closed successfully`,
        trend: "up",
        percentageChange:
          totalClosed > 0
            ? Math.round(((stats?.wonLeads ?? 0) / totalClosed) * 100)
            : 0,
      },
      {
        title: "Lost Deals",
        stat: `${stats?.lostLeads ?? 0} deals lost`,
        trend: "down",
        percentageChange:
          totalClosed > 0
            ? Math.round(((stats?.lostLeads ?? 0) / totalClosed) * 100)
            : 0,
      },
    ],
    [stats, totalClosed, t]
  );

  // TotalOrdersCard: contacts by source donut
  const sourceProps = useMemo(
    () =>
      buildDonutProps(
        contactsSourceData ?? [],
        t("dashboard.contactsBySource"),
        "total contacts",
        "Total contacts"
      ),
    [contactsSourceData, t]
  );

  // TotalOrdersCard: call outcomes donut
  const callProps = useMemo(
    () =>
      buildDonutProps(
        callOutcomesData ?? [],
        t("dashboard.callOutcomes"),
        "total calls",
        "Total calls"
      ),
    [callOutcomesData, t]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.subtitle")}
      />

      {/* KPI Statistics Cards */}
      {statsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <StatisticsOrderCard
            title={t("dashboard.totalContacts")}
            description="Total"
            value={fmtNumber(stats?.totalContacts ?? 0)}
            changePercentage={`${stats?.totalContacts ?? 0}`}
            blurred
          />
          <StatisticsSalesGrowthCard
            title={t("dashboard.pipelineValue")}
            description="Total pipeline"
            value={fmtCurrency(stats?.pipelineValue ?? 0)}
            changePercentage={fmtCurrency(stats?.pipelineValue ?? 0)}
            gradientId="fillPipeline"
            blurred
          />
          <StatisticsProfitCard
            title={t("dashboard.wonRevenue")}
            description="Total won"
            value={fmtCurrency(stats?.wonValue ?? 0)}
            changePercentage={`${stats?.wonLeads ?? 0} ${t("dashboard.wonDeals").toLowerCase()}`}
            blurred
          />
          <StatisticsImpressionCard
            title={t("dashboard.openDeals")}
            description="Active"
            value={fmtNumber(stats?.openLeads ?? 0)}
            changePercentage={`${stats?.openLeads ?? 0} open`}
            blurred
          />
          <StatisticsUserReachCard
            title="Win Rate"
            description={t("dashboard.winRate", { rate: Math.round((stats?.winRate ?? 0) * 100) })}
            value={`${Math.round((stats?.winRate ?? 0) * 100)}%`}
            changePercentage={`${Math.round((stats?.winRate ?? 0) * 100)}%`}
            centerValue={Math.round((stats?.winRate ?? 0) * 100)}
            centerLabel="Win %"
            blurred
          />
        </div>
      )}

      {/* Revenue Overview – TotalIncomeCard 1:1 */}
      <TotalIncomeCard
        title={t("dashboard.revenueByMonth")}
        subtitle="Revenue overview"
        reportTitle="Summary"
        reportSubtitle="Key metrics"
        chartData={revenueChartData.length >= 5 ? revenueChartData : undefined}
        reportData={revenueReportData}
        blurred={revenueChartData.length < 5}
      />

      {/* Pipeline by Stage */}
      <CrmPipelineChart
        data={(stageData ?? []).length >= 2 ? stageData : undefined}
        blurred={(stageData ?? []).length < 2}
      />

      {/* Won Deals + Win Rate */}
      <div className="grid gap-6 md:grid-cols-2">
        <EarningReportCard
          title={t("dashboard.wonDealsByDay")}
          subTitle="Deals overview"
          statData={dealsStatData}
          chartData={dealsChartData.length >= 5 ? dealsChartData : undefined}
          blurred={dealsChartData.length < 5}
        />
        <ConversionRateCard
          title="Win Rate"
          subTitle="Deal conversion overview"
          totalConversion={winPct}
          conversionTrend={winPct >= 50 ? "up" : "down"}
          percentageChange={Math.abs(winPct - 50)}
          conversionData={conversionData}
          chartData={conversionChartData.length >= 3 ? conversionChartData : undefined}
          blurred={conversionChartData.length < 3}
        />
      </div>

      {/* Contacts by Source + Call Outcomes */}
      <div className="grid gap-6 md:grid-cols-2">
        <TotalOrdersCard
          {...((contactsSourceData ?? []).length >= 2 ? sourceProps : {})}
          title={sourceProps.title}
          blurred={(contactsSourceData ?? []).length < 2}
        />
        <TotalOrdersCard
          {...((callOutcomesData ?? []).length >= 2 ? callProps : {})}
          title={callProps.title}
          blurred={(callOutcomesData ?? []).length < 2}
        />
      </div>

      {/* Upcoming Activities + Top Performers */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UpcomingActivities activities={upcomingData ?? []} />
        </div>
        <TopPerformers
          performers={performersData ?? []}
          timeRange={timeRange}
        />
      </div>
    </div>
  );
}
