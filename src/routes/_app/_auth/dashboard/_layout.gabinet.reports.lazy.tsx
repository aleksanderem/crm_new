import { createLazyFileRoute } from "@tanstack/react-router";
import type { Id } from "@cvx/_generated/dataModel";
import Papa from "papaparse";
import { toast } from "sonner";
import { useSupabaseGabinetAppointmentsByDateRange } from "@/hooks/use-supabase-gabinet-appointments";
import {
  useSupabaseGratisBarterAppointmentIds,
  useSupabasePaymentsRevenueByDateRange,
} from "@/hooks/use-supabase-payments";
import {
  useSupabaseGabinetDayClosesInRange,
  type GabinetDayClose,
} from "@/hooks/use-supabase-day-close";
import {
  useSupabaseGabinetSafeMovements,
  useSupabaseGabinetSafeMovementsInRange,
  type GabinetSafeMovement,
} from "@/hooks/use-supabase-safe";
import { useSupabaseGabinetTreatmentsList } from "@/hooks/use-supabase-gabinet-treatments";
import { useSupabaseGabinetPatientsList } from "@/hooks/use-supabase-gabinet-patients";
import { useSupabaseGabinetEmployeesList } from "@/hooks/use-supabase-gabinet-employees";
import { useSupabaseGabinetLocationsList } from "@/hooks/use-supabase-gabinet-locations";
import {
  useSupabaseGabinetTreatmentPackagesList,
  useSupabaseGabinetPackageUsageByDateRange,
} from "@/hooks/use-supabase-gabinet-packages";
import {
  useSupabaseDirectSalesByDateRange,
  type DirectSaleMovement,
} from "@/hooks/use-supabase-products";
import type { MappedGabinetPackageUsage } from "@/lib/supabase/mappers/gabinet/package-usage";
import type { MappedGabinetTreatmentPackage } from "@/lib/supabase/mappers/gabinet/treatment-packages";
import { useOrganization } from "@/components/org-context";
import { useActiveLocation } from "@/contexts/gabinet-location-context";
import { PermissionGate } from "@/hooks/use-permission";
import { formatCurrencyPLN } from "@/lib/format-currency";
import { PageHeader } from "@/components/layout/page-header";
import { SidePanel } from "@/components/crm/side-panel";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bucketizePairs,
  computeDailyStats,
  computeEmployeeStats,
  computeDirectSalesPaymentBreakdown,
  computePaymentMethodBreakdown,
  computeStatusStats,
  computeTreatmentStats,
  getPresetDateRange,
  slugify,
  type DateRangeKey,
} from "./gabinet-report-utils";
import { useTranslation } from "react-i18next";
import { EllipsisVerticalIcon } from "@/lib/ez-icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  LabelList,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

// shadcn/studio statistics blocks
import StatisticsOrderCard from "@/components/shadcn-studio/blocks/statistics-order-card";
import StatisticsProfitCard from "@/components/shadcn-studio/blocks/statistics-profit-card";
import StatisticsImpressionCard from "@/components/shadcn-studio/blocks/statistics-impression-card";
import StatisticsSalesGrowthCard from "@/components/shadcn-studio/blocks/statistics-sales-growth-card";

function GabinetReportsSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function GabinetReportsRoute() {
  const { activeLocationId } = useActiveLocation();
  return (
    <PermissionGate
      feature="gabinet_reports"
      action="view"
      locationId={(activeLocationId ?? undefined) as Id<"gabinetLocations"> | undefined}
      loadingFallback={<GabinetReportsSkeleton />}
    >
      <GabinetReports />
    </PermissionGate>
  );
}

export const Route = createLazyFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/reports"
)({
  component: GabinetReportsRoute,
});


const DONUT_COLORS = [
  "var(--primary)",
  "color-mix(in oklab, var(--primary) 70%, transparent)",
  "color-mix(in oklab, var(--primary) 50%, transparent)",
  "color-mix(in oklab, var(--primary) 35%, transparent)",
  "color-mix(in oklab, var(--primary) 20%, transparent)",
];

const UTILIZATION_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];


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

/* ─── KPI Statistics Card ─── */

/* ─── Revenue Summary Card ─── */

function RevenueSummaryCard({
  lastDayRevenue,
  last7Revenue,
  totalRevenue,
  currency,
  actualLastDay,
  actualLast7,
  actualTotal,
}: {
  lastDayRevenue: number;
  last7Revenue: number;
  totalRevenue: number;
  currency: string;
  actualLastDay: number;
  actualLast7: number;
  actualTotal: number;
}) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader className="flex justify-between border-b">
        <span className="text-lg font-semibold">
          {t("gabinet.reports.revenue")}
        </span>
        <CardMenu />
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        <div>
          <p className="text-muted-foreground mb-3 text-xs font-medium">
            {t("gabinet.reports.estimatedFromCompletedAppointments")}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1 sm:border-r sm:pr-4">
              <span className="text-muted-foreground text-sm">
                {t("gabinet.reports.lastDay")}
              </span>
              <span className="text-xl font-semibold">
                {formatCurrencyPLN(lastDayRevenue, currency, { fractionDigits: 0 })}
              </span>
            </div>
            <div className="flex flex-col gap-1 sm:border-r sm:pr-4">
              <span className="text-muted-foreground text-sm">
                {t("gabinet.reports.last7days")}
              </span>
              <span className="text-xl font-semibold">
                {formatCurrencyPLN(last7Revenue, currency, { fractionDigits: 0 })}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-sm">
                {t("gabinet.reports.periodTotal")}
              </span>
              <span className="text-xl font-semibold">
                {formatCurrencyPLN(totalRevenue, currency, { fractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>
        <div className="border-t pt-4">
          <p className="text-muted-foreground mb-3 text-xs font-medium">
            {t("gabinet.reports.collectedFromPayments")}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1 sm:border-r sm:pr-4">
              <span className="text-muted-foreground text-sm">
                {t("gabinet.reports.lastDay")}
              </span>
              <span className="text-xl font-semibold">
                {formatCurrencyPLN(actualLastDay, currency, { fractionDigits: 0 })}
              </span>
            </div>
            <div className="flex flex-col gap-1 sm:border-r sm:pr-4">
              <span className="text-muted-foreground text-sm">
                {t("gabinet.reports.last7days")}
              </span>
              <span className="text-xl font-semibold">
                {formatCurrencyPLN(actualLast7, currency, { fractionDigits: 0 })}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-sm">
                {t("gabinet.reports.periodTotal")}
              </span>
              <span className="text-xl font-semibold">
                {formatCurrencyPLN(actualTotal, currency, { fractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Payment Methods Breakdown Card ─── */

const PAYMENT_METHOD_COLORS: Record<string, string> = {
  cash: "var(--chart-1)",
  card: "var(--chart-2)",
  transfer: "var(--chart-3)",
  package: "var(--chart-4)",
  other: "var(--chart-5)",
};

function PaymentMethodsCard({
  data,
  currency,
  rangeLabel,
}: {
  data: { method: string; total: number; count: number }[];
  currency: string;
  rangeLabel: string;
}) {
  const { t } = useTranslation();
  const grandTotal = data.reduce((sum, d) => sum + d.total, 0);
  const hasData = grandTotal > 0;
  const activeItems = data.filter((d) => d.count > 0);

  return (
    <Card>
      <CardHeader className="flex justify-between border-b">
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold">
            {t("gabinet.reports.paymentMethods")}
          </span>
          <span className="text-muted-foreground text-sm">{rangeLabel}</span>
        </div>
        <CardMenu />
      </CardHeader>
      <CardContent className="pt-4">
        {!hasData ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-muted-foreground text-sm">
              {t("common.noResults")}
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            {activeItems.map((item) => {
              const pct =
                grandTotal > 0
                  ? Math.round((item.total / grandTotal) * 100)
                  : 0;
              const color =
                PAYMENT_METHOD_COLORS[item.method] ?? "var(--chart-4)";
              return (
                <div key={item.method} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="font-medium truncate">
                        {t(`gabinet.reports.paymentMethod.${item.method}`, item.method)}
                      </span>
                      <span className="text-muted-foreground text-xs shrink-0">
                        {item.count}×
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-muted-foreground">{pct}%</span>
                      <span className="font-semibold">
                        {formatCurrencyPLN(item.total, currency, {
                          fractionDigits: 0,
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="border-t pt-3 flex items-center justify-between text-sm font-semibold">
              <span>{t("gabinet.reports.periodTotal")}</span>
              <span>
                {formatCurrencyPLN(grandTotal, currency, { fractionDigits: 0 })}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Treatment Popularity (horizontal bar) ─── */

function TreatmentPopularityChart({
  data,
  rangeLabel,
}: {
  data: { name: string; count: number; revenue: number }[];
  rangeLabel: string;
}) {
  const { t } = useTranslation();

  const treatmentChartConfig = useMemo(
    () =>
      ({
        count: { label: t("gabinet.reports.appointments"), color: "var(--primary)" },
      }) satisfies ChartConfig,
    [t]
  );

  const chartData = useMemo(
    () => data.map((d) => ({ treatment: d.name, count: d.count })),
    [data]
  );

  const maxCount = useMemo(() => {
    const max = Math.max(...data.map((d) => d.count), 0);
    return Math.ceil((max * 1.3) / 5) * 5 || 10;
  }, [data]);

  if (!data.length)
    return (
      <Card>
        <CardHeader className="flex justify-between border-b">
          <span className="text-lg font-semibold">
            {t("gabinet.reports.treatmentPopularity")}
          </span>
          <CardMenu />
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <span className="text-muted-foreground text-sm">
            {t("common.noResults")}
          </span>
        </CardContent>
      </Card>
    );

  return (
    <Card>
      <CardHeader className="flex justify-between border-b">
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold">
            {t("gabinet.reports.treatmentPopularity")}
          </span>
          <span className="text-muted-foreground text-sm">{rangeLabel}</span>
        </div>
        <CardMenu />
      </CardHeader>
      <CardContent className="flex flex-1 overflow-x-auto">
        <ChartContainer
          config={treatmentChartConfig}
          className="min-h-80 w-full min-w-[400px]"
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            barSize={24}
            margin={{ left: -26, right: 25 }}
          >
            <CartesianGrid
              horizontal={false}
              strokeDasharray="4"
              stroke="var(--border)"
            />
            <XAxis
              type="number"
              dataKey="count"
              domain={[0, maxCount]}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            />
            <YAxis
              dataKey="treatment"
              type="category"
              tickLine={false}
              tickMargin={8}
              axisLine={false}
              fontSize={14}
              width={160}
              tickFormatter={(v: string) =>
                v.length > 20 ? `${v.slice(0, 18)}…` : v
              }
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Bar dataKey="count" fill="var(--chart-2)" radius={6}>
              <LabelList
                dataKey="count"
                offset={24}
                position="insideLeft"
                fill="var(--primary-foreground)"
                className="text-sm"
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/* ─── Status Distribution (donut) ─── */

function StatusDistributionChart({
  data,
  total,
}: {
  data: { status: string; count: number }[];
  total: number;
}) {
  const { t } = useTranslation();

  const top = useMemo(() => data.slice(0, 5), [data]);

  const { chartData, chartConfig } = useMemo(() => {
    const config: ChartConfig = { count: { label: t("gabinet.reports.appointments") } };
    const items = top.map((item, i) => {
      const key = slugify(item.status);
      config[key] = {
        label: t(`gabinet.reports.statuses.${item.status}`, item.status.replace("_", " ")),
        color: DONUT_COLORS[i % DONUT_COLORS.length],
      };
      return { category: key, count: item.count, fill: `var(--color-${key})` };
    });
    return { chartData: items, chartConfig: config };
  }, [top, t]);

  const topPct = useMemo(
    () =>
      total > 0
        ? Math.round((top.reduce((s, d) => s + d.count, 0) / total) * 100)
        : 0,
    [top, total]
  );

  if (!data.length)
    return (
      <Card>
        <CardHeader className="flex justify-between border-b">
          <span className="text-lg font-semibold">
            {t("gabinet.reports.statusDistribution")}
          </span>
          <CardMenu />
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <span className="text-muted-foreground text-sm">
            {t("common.noResults")}
          </span>
        </CardContent>
      </Card>
    );

  return (
    <Card className="gap-4">
      <CardHeader className="flex justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold">
            {t("gabinet.reports.statusDistribution")}
          </span>
          <span className="text-muted-foreground text-sm">
            {total.toLocaleString()}{" "}
            {t("gabinet.reports.totalAppointments").toLowerCase()}
          </span>
        </div>
        <CardMenu />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col justify-center gap-2">
            <span className="text-3xl font-semibold">
              {total.toLocaleString()}
            </span>
            <span className="text-muted-foreground text-sm">
              {t("gabinet.reports.totalAppointments")}
            </span>
          </div>
          <ChartContainer config={chartConfig} className="h-30 w-full">
            <PieChart margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="category"
                innerRadius={40}
                outerRadius={60}
                paddingAngle={3}
              >
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) - 7}
                            className="fill-card-foreground text-lg font-semibold"
                          >
                            {topPct}%
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 14}
                            className="fill-muted-foreground text-sm"
                          >
                            {t("gabinet.reports.topN", { count: top.length })}
                          </tspan>
                        </text>
                      );
                    }
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        </div>

        {top.map((item, index) => (
          <div
            key={index}
            className="flex flex-1 items-center justify-between gap-2"
          >
            <div className="flex items-center justify-between gap-2">
              <Avatar className="size-10 rounded-sm">
                <AvatarFallback className="bg-primary/10 text-primary shrink-0 rounded-sm">
                  <div
                    className="size-4 rounded-full"
                    style={{
                      backgroundColor:
                        DONUT_COLORS[index % DONUT_COLORS.length],
                    }}
                  />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium capitalize">
                  {t(`gabinet.reports.statuses.${item.status}`, item.status.replace("_", " "))}
                </span>
                <span className="text-muted-foreground text-sm">
                  {total > 0
                    ? `${Math.round((item.count / total) * 100)}% ${t("gabinet.reports.ofTotal")}`
                    : "0%"}
                </span>
              </div>
            </div>
            <span className="text-sm">{item.count.toLocaleString()}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ─── Daily Volume (bar chart) ─── */

function DailyVolumeChart({
  data,
  rangeLabel,
}: {
  data: { date: string; count: number }[];
  rangeLabel: string;
}) {
  const { t } = useTranslation();

  const dailyChartConfig = {
    count: { label: t("gabinet.reports.appointments") },
  } satisfies ChartConfig;

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        day: d.date,
        count: d.count,
        fill: "var(--chart-2)",
      })),
    [data]
  );

  if (!data.length)
    return (
      <Card>
        <CardHeader className="flex justify-between border-b">
          <span className="text-lg font-semibold">
            {t("gabinet.reports.dailyVolume")}
          </span>
          <CardMenu />
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <span className="text-muted-foreground text-sm">
            {t("common.noResults")}
          </span>
        </CardContent>
      </Card>
    );

  return (
    <Card>
      <CardHeader className="flex justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold">
            {t("gabinet.reports.dailyVolume")}
          </span>
          <span className="text-muted-foreground text-sm">{rangeLabel}</span>
        </div>
        <CardMenu />
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <ChartContainer config={dailyChartConfig} className="h-45 w-full min-w-[300px]">
          <BarChart
            accessibilityLayer
            data={chartData}
            barSize={36}
            margin={{ top: 7, left: -4, right: -4 }}
          >
            <XAxis
              dataKey="day"
              tickLine={false}
              tickMargin={5.5}
              axisLine={false}
              tickFormatter={(value) => {
                const d = new Date(value);
                return `${d.getDate()}/${d.getMonth() + 1}`;
              }}
              className="text-sm"
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Bar dataKey="count" radius={8} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/* ─── Employee Utilization ─── */

function EmployeeUtilizationChart({
  data,
  rangeLabel,
}: {
  data: { name: string; count: number; completedCount: number; revenue: number }[];
  rangeLabel: string;
}) {
  const { t } = useTranslation();

  const utilizationConfig = useMemo(
    () =>
      ({
        count: { label: t("gabinet.reports.appointments"), color: "var(--chart-2)" },
        completedCount: { label: t("gabinet.reports.completed"), color: "var(--chart-1)" },
      }) satisfies ChartConfig,
    [t]
  );

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        employee: d.name,
        count: d.count,
        completedCount: d.completedCount,
      })),
    [data]
  );

  if (!data.length)
    return (
      <Card>
        <CardHeader className="flex justify-between border-b">
          <span className="text-lg font-semibold">
            {t("gabinet.reports.employeeUtilization")}
          </span>
          <CardMenu />
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <span className="text-muted-foreground text-sm">
            {t("common.noResults")}
          </span>
        </CardContent>
      </Card>
    );

  return (
    <Card>
      <CardHeader className="flex justify-between border-b">
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold">
            {t("gabinet.reports.employeeUtilization")}
          </span>
          <span className="text-muted-foreground text-sm">{rangeLabel}</span>
        </div>
        <CardMenu />
      </CardHeader>
      <CardContent>
        <div className="mt-4 space-y-3">
          {data.map((emp, i) => {
            const pct =
              emp.count > 0
                ? Math.round((emp.completedCount / emp.count) * 100)
                : 0;
            return (
              <div key={i} className="flex items-center gap-3">
                <Avatar className="size-8 shrink-0 rounded-full">
                  <AvatarFallback
                    className="text-xs font-semibold text-white"
                    style={{
                      backgroundColor:
                        UTILIZATION_COLORS[i % UTILIZATION_COLORS.length],
                    }}
                  >
                    {emp.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate">
                      {emp.name}
                    </span>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      {emp.revenue > 0 && (
                        <span className="text-sm font-medium">
                          {formatCurrencyPLN(emp.revenue)}
                        </span>
                      )}
                      <span className="text-sm text-muted-foreground">
                        {emp.count} {t("gabinet.reports.appointmentsShort")}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor:
                          UTILIZATION_COLORS[i % UTILIZATION_COLORS.length],
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {pct}% {t("gabinet.reports.completionRate")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="overflow-x-auto">
        <ChartContainer config={utilizationConfig} className="mt-6 h-45 w-full min-w-[300px]">
          <BarChart
            accessibilityLayer
            data={chartData}
            barSize={24}
            margin={{ top: 7, left: -4, right: -4 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="4" stroke="var(--border)" />
            <XAxis
              dataKey="employee"
              tickLine={false}
              tickMargin={5.5}
              axisLine={false}
              tickFormatter={(v) => v.split(" ")[0]}
              className="text-sm"
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="completedCount" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Top Treatments by Revenue ─── */

function TopTreatmentsByRevenue({
  data,
  rangeLabel,
}: {
  data: { name: string; count: number; revenue: number }[];
  rangeLabel: string;
}) {
  const { t } = useTranslation();

  const top5 = useMemo(() => data.slice(0, 5), [data]);
  const maxRevenue = useMemo(
    () => Math.max(...top5.map((d) => d.revenue), 1),
    [top5]
  );

  if (!top5.length)
    return (
      <Card>
        <CardHeader className="flex justify-between border-b">
          <span className="text-lg font-semibold">
            {t("gabinet.reports.topTreatmentsByRevenue")}
          </span>
          <CardMenu />
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <span className="text-muted-foreground text-sm">
            {t("common.noResults")}
          </span>
        </CardContent>
      </Card>
    );

  return (
    <Card>
      <CardHeader className="flex justify-between border-b">
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold">
            {t("gabinet.reports.topTreatmentsByRevenue")}
          </span>
          <span className="text-muted-foreground text-sm">{rangeLabel}</span>
        </div>
        <CardMenu />
      </CardHeader>
      <CardContent className="mt-4 space-y-4">
        {top5.map((item, i) => {
          const pct = Math.round((item.revenue / maxRevenue) * 100);
          return (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium truncate max-w-[60%]">
                  {item.name}
                </span>
                <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                  <span>{item.count}×</span>
                  <span className="font-semibold text-foreground">
                    {formatCurrencyPLN(item.revenue, "PLN", { fractionDigits: 0 })}
                  </span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length],
                  }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/* ─── Package Sales Section ─── */

function PackageSalesSection({
  usages,
  isLoading: sectionLoading,
  packages,
  packageNameMap,
  employeeMap,
  employeeMapById,
  patientMap,
  rangeLabel,
  currency,
  startDate,
  endDate,
}: {
  usages: MappedGabinetPackageUsage[];
  isLoading: boolean;
  packages: MappedGabinetTreatmentPackage[];
  packageNameMap: Map<string, string>;
  employeeMap: Map<string, string>;
  employeeMapById: Map<string, string>;
  patientMap: Map<string, string>;
  rangeLabel: string;
  currency: string;
  startDate: string;
  endDate: string;
}) {
  const { t } = useTranslation();
  const [filterPackageId, setFilterPackageId] = useState("all");

  const filteredUsages = useMemo(
    () => (filterPackageId === "all" ? usages : usages.filter((u) => u.packageId === filterPackageId)),
    [usages, filterPackageId],
  );

  const { totalSold, totalRevenue, avgPrice } = useMemo(() => {
    const total = filteredUsages.reduce((s, u) => s + u.paidAmount, 0);
    return {
      totalSold: filteredUsages.length,
      totalRevenue: total,
      avgPrice: filteredUsages.length > 0 ? total / filteredUsages.length : 0,
    };
  }, [filteredUsages]);

  const groupBy = useMemo<"day" | "week" | "month">(() => {
    const diffDays =
      Math.ceil(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) /
          (1000 * 60 * 60 * 24),
      ) + 1;
    return diffDays <= 14 ? "day" : diffDays <= 90 ? "week" : "month";
  }, [startDate, endDate]);

  const revenueByPeriod = useMemo(() => {
    const buckets = new Map<string, { revenue: number; count: number }>();
    for (const u of filteredUsages) {
      const d = new Date(u.purchasedAt);
      let key: string;
      if (groupBy === "day") {
        key = d.toISOString().split("T")[0];
      } else if (groupBy === "week") {
        const tmp = new Date(d);
        tmp.setHours(0, 0, 0, 0);
        tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
        const yearStart = new Date(tmp.getFullYear(), 0, 1);
        const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
        key = `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
      const prev = buckets.get(key) ?? { revenue: 0, count: 0 };
      buckets.set(key, { revenue: prev.revenue + u.paidAmount, count: prev.count + 1 });
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0]!.localeCompare(b[0]!))
      .map(([period, s]) => ({ period, revenue: s.revenue, count: s.count }));
  }, [filteredUsages, groupBy]);

  const packageRevenueChartConfig = useMemo(
    () => ({ revenue: { label: t("gabinet.reports.revenue"), color: "var(--chart-1)" } }) satisfies ChartConfig,
    [t],
  );

  const perPackage = useMemo(() => {
    const m = new Map<string, { count: number; revenue: number }>();
    for (const u of filteredUsages) {
      const prev = m.get(u.packageId) ?? { count: 0, revenue: 0 };
      m.set(u.packageId, { count: prev.count + 1, revenue: prev.revenue + u.paidAmount });
    }
    return Array.from(m.entries())
      .map(([id, s]) => ({ id, name: packageNameMap.get(id) ?? id, count: s.count, revenue: s.revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredUsages, packageNameMap]);

  const perEmployee = useMemo(() => {
    const m = new Map<string, { count: number; revenue: number; isByEmployeeId: boolean }>();
    for (const u of filteredUsages) {
      const key = u.soldByEmployeeId ?? u.createdBy;
      const isByEmployeeId = !!u.soldByEmployeeId;
      const prev = m.get(key) ?? { count: 0, revenue: 0, isByEmployeeId };
      m.set(key, { count: prev.count + 1, revenue: prev.revenue + u.paidAmount, isByEmployeeId });
    }
    return Array.from(m.entries())
      .map(([key, s]) => ({
        name: s.isByEmployeeId
          ? (employeeMapById.get(key) ?? key)
          : (employeeMap.get(key) ?? key),
        count: s.count,
        revenue: s.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredUsages, employeeMap, employeeMapById]);

  const perPatient = useMemo(() => {
    const m = new Map<string, { count: number; revenue: number }>();
    for (const u of filteredUsages) {
      if (!u.patientId) continue;
      const prev = m.get(u.patientId) ?? { count: 0, revenue: 0 };
      m.set(u.patientId, { count: prev.count + 1, revenue: prev.revenue + u.paidAmount });
    }
    return Array.from(m.entries())
      .map(([id, s]) => ({ name: patientMap.get(id) ?? id, count: s.count, revenue: s.revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [filteredUsages, patientMap]);

  const maxPackageRevenue = useMemo(
    () => Math.max(...perPackage.map((p) => p.revenue), 1),
    [perPackage],
  );

  if (sectionLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t("gabinet.reports.packageSales")}</h2>
          <p className="text-muted-foreground text-sm">{rangeLabel}</p>
        </div>
        <Select value={filterPackageId} onValueChange={setFilterPackageId}>
          <SelectTrigger className="w-52" aria-label={t("gabinet.reports.filterByPackage")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("gabinet.reports.allPackages")}</SelectItem>
            {packages.map((p) => (
              <SelectItem key={p._id} value={p._id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">{t("gabinet.reports.totalPackagesSold")}</p>
            <p className="mt-1 text-2xl font-bold">{totalSold}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">{t("gabinet.reports.totalPackageRevenue")}</p>
            <p className="mt-1 text-2xl font-bold">
              {formatCurrencyPLN(totalRevenue, currency, { fractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">{t("gabinet.reports.avgPackagePrice")}</p>
            <p className="mt-1 text-2xl font-bold">
              {formatCurrencyPLN(avgPrice, currency, { fractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue over time bar chart */}
      {revenueByPeriod.length > 0 && (
        <Card>
          <CardHeader className="flex justify-between">
            <div className="flex flex-col gap-1">
              <span className="font-semibold">{t("gabinet.reports.packageRevenueOverTime")}</span>
              <span className="text-muted-foreground text-sm">{rangeLabel}</span>
            </div>
            <CardMenu />
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <ChartContainer config={packageRevenueChartConfig} className="h-52 w-full min-w-[300px]">
              <BarChart
                accessibilityLayer
                data={revenueByPeriod}
                margin={{ top: 7, left: 4, right: 4 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="period"
                  tickLine={false}
                  tickMargin={5}
                  axisLine={false}
                  tickFormatter={(value: string) => {
                    if (groupBy === "day") {
                      const d = new Date(value + "T12:00:00");
                      return `${d.getDate()}/${d.getMonth() + 1}`;
                    }
                    if (groupBy === "week") {
                      return value.split("-")[1];
                    }
                    const d = new Date(value + "-01T12:00:00");
                    return `${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
                  }}
                  className="text-sm"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) =>
                    formatCurrencyPLN(value, currency, { fractionDigits: 0 })
                  }
                  width={80}
                  className="text-xs"
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      formatter={(value) =>
                        formatCurrencyPLN(Number(value), currency, { fractionDigits: 0 })
                      }
                    />
                  }
                />
                <Bar dataKey="revenue" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {filteredUsages.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <span className="text-muted-foreground text-sm">{t("gabinet.reports.noPackageSales")}</span>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Per package breakdown */}
          <Card>
            <CardHeader className="flex justify-between border-b">
              <span className="font-semibold">{t("gabinet.reports.perPackageBreakdown")}</span>
              <CardMenu />
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {perPackage.map((item) => {
                const pct = Math.round((item.revenue / maxPackageRevenue) * 100);
                return (
                  <div key={item.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="max-w-[55%] truncate font-medium">{item.name}</span>
                      <div className="ml-2 flex shrink-0 items-center gap-2">
                        <span className="text-muted-foreground">{item.count}×</span>
                        <span className="font-semibold">
                          {formatCurrencyPLN(item.revenue, currency, { fractionDigits: 0 })}
                        </span>
                      </div>
                    </div>
                    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: "var(--primary)" }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Per employee breakdown */}
          <Card>
            <CardHeader className="flex justify-between border-b">
              <span className="font-semibold">{t("gabinet.reports.perEmployeePackageSales")}</span>
              <CardMenu />
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {perEmployee.length === 0 ? (
                <span className="text-muted-foreground text-sm">{t("common.noResults")}</span>
              ) : (
                perEmployee.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="max-w-[55%] truncate font-medium">{item.name}</span>
                    <div className="ml-2 flex shrink-0 items-center gap-2">
                      <span className="text-muted-foreground">{item.count}×</span>
                      <span className="font-semibold">
                        {formatCurrencyPLN(item.revenue, currency, { fractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Per patient breakdown (top 10) */}
          <Card>
            <CardHeader className="flex justify-between border-b">
              <span className="font-semibold">{t("gabinet.reports.perPatientPackageSales")}</span>
              <CardMenu />
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {perPatient.length === 0 ? (
                <span className="text-muted-foreground text-sm">{t("common.noResults")}</span>
              ) : (
                perPatient.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="max-w-[55%] truncate font-medium">{item.name}</span>
                    <div className="ml-2 flex shrink-0 items-center gap-2">
                      <span className="text-muted-foreground">{item.count}×</span>
                      <span className="font-semibold">
                        {formatCurrencyPLN(item.revenue, currency, { fractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ─── Product Sales Section ─── */

function ProductSalesSection({
  movements,
  isLoading,
  employeeMapById,
  rangeLabel,
  currency,
}: {
  movements: DirectSaleMovement[];
  isLoading: boolean;
  employeeMapById: Map<string, string>;
  rangeLabel: string;
  currency: string;
}) {
  const { t } = useTranslation();

  const sales = useMemo(() => movements.filter((m) => m.reason === "direct_sale"), [movements]);
  const returns = useMemo(() => movements.filter((m) => m.reason === "direct_sale_return"), [movements]);

  const totalRevenue = useMemo(() => sales.reduce((s, m) => s + m.revenue, 0), [sales]);
  const totalReturns = useMemo(() => returns.reduce((s, m) => s + m.revenue, 0), [returns]);
  const netRevenue = totalRevenue - totalReturns;

  const perProduct = useMemo(() => {
    const m = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const mv of sales) {
      const prev = m.get(mv.productId) ?? { name: mv.productName, quantity: 0, revenue: 0 };
      m.set(mv.productId, {
        name: mv.productName,
        quantity: prev.quantity + mv.quantity,
        revenue: prev.revenue + mv.revenue,
      });
    }
    return Array.from(m.values()).sort((a, b) => b.revenue - a.revenue);
  }, [sales]);

  const perEmployee = useMemo(() => {
    const m = new Map<string, { quantity: number; revenue: number }>();
    for (const mv of sales) {
      const key = mv.employeeId ?? "__unknown__";
      const prev = m.get(key) ?? { quantity: 0, revenue: 0 };
      m.set(key, { quantity: prev.quantity + mv.quantity, revenue: prev.revenue + mv.revenue });
    }
    return Array.from(m.entries())
      .map(([key, s]) => ({
        name: key === "__unknown__" ? t("common.unknown", "Unknown") : (employeeMapById.get(key) ?? key),
        quantity: s.quantity,
        revenue: s.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [sales, employeeMapById, t]);

  const maxProductRevenue = useMemo(() => Math.max(...perProduct.map((p) => p.revenue), 1), [perProduct]);

  const { breakdown: paymentMethodBreakdown, unattributedReturnAmount, unattributedReturnCount } = useMemo(
    () => computeDirectSalesPaymentBreakdown(sales, returns),
    [sales, returns],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t("gabinet.reports.productSales")}</h2>
        <p className="text-muted-foreground text-sm">{rangeLabel}</p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">{t("gabinet.reports.totalProductRevenue")}</p>
            <p className="mt-1 text-2xl font-bold">
              {formatCurrencyPLN(totalRevenue, currency, { fractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">{t("gabinet.reports.totalProductReturns")}</p>
            <p className="mt-1 text-2xl font-bold">
              {formatCurrencyPLN(totalReturns, currency, { fractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">{t("gabinet.reports.netProductRevenue")}</p>
            <p className={`mt-1 text-2xl font-bold ${netRevenue < 0 ? "text-red-600" : ""}`}>
              {formatCurrencyPLN(netRevenue, currency, { fractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
      </div>

      {movements.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <span className="text-muted-foreground text-sm">{t("gabinet.reports.noProductSales")}</span>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Per product breakdown */}
          <Card>
            <CardHeader className="flex justify-between border-b">
              <span className="font-semibold">{t("gabinet.reports.perProductBreakdown")}</span>
              <CardMenu />
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {perProduct.length === 0 ? (
                <span className="text-muted-foreground text-sm">{t("common.noResults")}</span>
              ) : (
                perProduct.map((item, i) => {
                  const pct = Math.round((item.revenue / maxProductRevenue) * 100);
                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="max-w-[55%] truncate font-medium">{item.name}</span>
                        <div className="ml-2 flex shrink-0 items-center gap-2">
                          <span className="text-muted-foreground">{item.quantity}×</span>
                          <span className="font-semibold">
                            {formatCurrencyPLN(item.revenue, currency, { fractionDigits: 0 })}
                          </span>
                        </div>
                      </div>
                      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: "var(--chart-3)" }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Per employee breakdown */}
          <Card>
            <CardHeader className="flex justify-between border-b">
              <span className="font-semibold">{t("gabinet.reports.perEmployeeProductSales")}</span>
              <CardMenu />
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {perEmployee.length === 0 ? (
                <span className="text-muted-foreground text-sm">{t("common.noResults")}</span>
              ) : (
                perEmployee.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="max-w-[55%] truncate font-medium">{item.name}</span>
                    <div className="ml-2 flex shrink-0 items-center gap-2">
                      <span className="text-muted-foreground">{item.quantity}×</span>
                      <span className="font-semibold">
                        {formatCurrencyPLN(item.revenue, currency, { fractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {movements.length > 0 && (
        <div className="space-y-2">
          <PaymentMethodsCard data={paymentMethodBreakdown} currency={currency} rangeLabel={rangeLabel} />
          {unattributedReturnCount > 0 && (
            <p className="text-muted-foreground text-xs px-1">
              {t("gabinet.reports.unattributedReturnsNote", {
                count: unattributedReturnCount,
                amount: formatCurrencyPLN(unattributedReturnAmount, currency, { fractionDigits: 2 }),
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Cash Register Report Section ─── */

function CashRegisterReportSection({
  dayCloses,
  isLoading,
  rangeLabel,
  currency,
}: {
  dayCloses: GabinetDayClose[];
  isLoading: boolean;
  rangeLabel: string;
  currency: string;
}) {
  const { t } = useTranslation();

  const totals = useMemo(() => {
    let cashFromPayments = 0;
    let deposits = 0;
    let withdrawals = 0;
    let discrepancy = 0;
    let toSafe = 0;
    for (const dc of dayCloses) {
      cashFromPayments += dc.cashFromPayments;
      deposits += dc.cashDeposits;
      withdrawals += dc.cashWithdrawals;
      discrepancy += dc.cashDiscrepancy;
      toSafe += dc.cashToSafe ?? 0;
    }
    return { cashFromPayments, deposits, withdrawals, discrepancy, toSafe };
  }, [dayCloses]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{t("gabinet.reports.cashRegisterReport")}</h2>
        <p className="text-muted-foreground text-sm">{rangeLabel}</p>
      </div>

      {dayCloses.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <span className="text-muted-foreground text-sm">
              {t("gabinet.reports.noDayCloses")}
            </span>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Aggregate KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-sm">{t("gabinet.cash.cashFromPayments")}</p>
                <p className="mt-1 text-2xl font-bold">
                  {formatCurrencyPLN(totals.cashFromPayments, currency, { fractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-sm">{t("gabinet.cash.deposits")}</p>
                <p className="mt-1 text-2xl font-bold">
                  {formatCurrencyPLN(totals.deposits, currency, { fractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-sm">{t("gabinet.cash.withdrawals")}</p>
                <p className="mt-1 text-2xl font-bold">
                  {formatCurrencyPLN(totals.withdrawals, currency, { fractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-sm">{t("gabinet.cash.cashToSafe")}</p>
                <p className="mt-1 text-2xl font-bold">
                  {formatCurrencyPLN(totals.toSafe, currency, { fractionDigits: 2 })}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t("gabinet.reports.cashToSafeNote")}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Detailed table */}
          <Card>
            <CardHeader className="border-b">
              <span className="font-semibold">{t("gabinet.cash.history")}</span>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-0">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-3 pr-4 font-medium text-muted-foreground">{t("common.date")}</th>
                    <th className="py-3 pr-4 text-right font-medium text-muted-foreground">{t("gabinet.cash.openingBalance")}</th>
                    <th className="py-3 pr-4 text-right font-medium text-muted-foreground">{t("gabinet.cash.cashFromPayments")}</th>
                    <th className="py-3 pr-4 text-right font-medium text-muted-foreground">{t("gabinet.cash.deposits")}</th>
                    <th className="py-3 pr-4 text-right font-medium text-muted-foreground">{t("gabinet.cash.withdrawals")}</th>
                    <th className="py-3 pr-4 text-right font-medium text-muted-foreground">{t("gabinet.cash.expectedCash")}</th>
                    <th className="py-3 pr-4 text-right font-medium text-muted-foreground">{t("gabinet.cash.countedCash")}</th>
                    <th className="py-3 pr-4 text-right font-medium text-muted-foreground">{t("gabinet.cash.discrepancy")}</th>
                    <th className="py-3 pr-4 text-right font-medium text-muted-foreground">{t("gabinet.cash.cashNextOpening")}</th>
                    <th className="py-3 text-right font-medium text-muted-foreground">{t("gabinet.cash.cashToSafe")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dayCloses.map((dc) => (
                    <tr key={dc.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 pr-4 font-medium">{dc.date}</td>
                      <td className="py-3 pr-4 text-right">{formatCurrencyPLN(dc.cashOpeningBalance, currency, { fractionDigits: 2 })}</td>
                      <td className="py-3 pr-4 text-right">{formatCurrencyPLN(dc.cashFromPayments, currency, { fractionDigits: 2 })}</td>
                      <td className="py-3 pr-4 text-right">{formatCurrencyPLN(dc.cashDeposits, currency, { fractionDigits: 2 })}</td>
                      <td className="py-3 pr-4 text-right">{formatCurrencyPLN(dc.cashWithdrawals, currency, { fractionDigits: 2 })}</td>
                      <td className="py-3 pr-4 text-right">{formatCurrencyPLN(dc.cashExpected, currency, { fractionDigits: 2 })}</td>
                      <td className="py-3 pr-4 text-right">{formatCurrencyPLN(dc.cashCounted, currency, { fractionDigits: 2 })}</td>
                      <td className={`py-3 pr-4 text-right font-medium ${dc.cashDiscrepancy === 0 ? "" : dc.cashDiscrepancy > 0 ? "text-green-600" : "text-red-600"}`}>
                        {dc.cashDiscrepancy > 0 ? "+" : ""}{formatCurrencyPLN(dc.cashDiscrepancy, currency, { fractionDigits: 2 })}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {dc.cashNextOpening != null
                          ? formatCurrencyPLN(dc.cashNextOpening, currency, { fractionDigits: 2 })
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-3 text-right">
                        {dc.cashToSafe != null
                          ? formatCurrencyPLN(dc.cashToSafe, currency, { fractionDigits: 2 })
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="border-t-2 bg-muted/30 font-semibold">
                    <td className="py-3 pr-4">{t("gabinet.reports.periodTotal")}</td>
                    <td className="py-3 pr-4 text-right text-muted-foreground">—</td>
                    <td className="py-3 pr-4 text-right">{formatCurrencyPLN(totals.cashFromPayments, currency, { fractionDigits: 2 })}</td>
                    <td className="py-3 pr-4 text-right">{formatCurrencyPLN(totals.deposits, currency, { fractionDigits: 2 })}</td>
                    <td className="py-3 pr-4 text-right">{formatCurrencyPLN(totals.withdrawals, currency, { fractionDigits: 2 })}</td>
                    <td className="py-3 pr-4 text-right text-muted-foreground">—</td>
                    <td className="py-3 pr-4 text-right text-muted-foreground">—</td>
                    <td className={`py-3 pr-4 text-right ${totals.discrepancy === 0 ? "" : totals.discrepancy > 0 ? "text-green-600" : "text-red-600"}`}>
                      {totals.discrepancy > 0 ? "+" : ""}{formatCurrencyPLN(totals.discrepancy, currency, { fractionDigits: 2 })}
                    </td>
                    <td className="py-3 pr-4 text-right text-muted-foreground">—</td>
                    <td className="py-3 text-right">{formatCurrencyPLN(totals.toSafe, currency, { fractionDigits: 2 })}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/* ─── Safe (Sejf) Report Section ─── */

function SafeReportSection({
  safeAll,
  safeRange,
  isLoadingAll,
  isLoadingRange,
  locationId,
  rangeLabel,
  currency,
}: {
  safeAll: { balance: number; totalIn: number; totalOut: number } | undefined;
  safeRange: { movements: GabinetSafeMovement[]; totalIn: number; totalOut: number } | undefined;
  isLoadingAll: boolean;
  isLoadingRange: boolean;
  locationId: string | null;
  rangeLabel: string;
  currency: string;
}) {
  const { t } = useTranslation();

  if (!locationId) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">{t("gabinet.reports.safeReport")}</h2>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <span className="text-muted-foreground text-sm">
              {t("gabinet.reports.safeSelectLocation")}
            </span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoadingAll || isLoadingRange) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  const balance = safeAll?.balance ?? 0;
  const totalIn = safeAll?.totalIn ?? 0;
  const totalOut = safeAll?.totalOut ?? 0;
  const rangeIn = safeRange?.totalIn ?? 0;
  const rangeOut = safeRange?.totalOut ?? 0;
  const movements = safeRange?.movements ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{t("gabinet.reports.safeReport")}</h2>
        <p className="text-muted-foreground text-sm">{rangeLabel}</p>
      </div>

      {/* Current balance (all-time) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">{t("gabinet.safe.balance")}</p>
            <p className="mt-1 text-2xl font-bold">
              {formatCurrencyPLN(balance, currency, { fractionDigits: 2 })}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{t("gabinet.safe.balanceDescription")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">{t("gabinet.safe.totalIn")}</p>
            <p className="mt-1 text-2xl font-bold">
              {formatCurrencyPLN(totalIn, currency, { fractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">{t("gabinet.safe.totalOut")}</p>
            <p className="mt-1 text-2xl font-bold">
              {formatCurrencyPLN(totalOut, currency, { fractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Period totals */}
      <Card>
        <CardHeader className="border-b">
          <span className="font-semibold">{t("gabinet.reports.safePeriodSummary")}</span>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground text-sm">{t("gabinet.reports.safeInPeriod")}</p>
            <p className="mt-1 text-lg font-semibold">
              {formatCurrencyPLN(rangeIn, currency, { fractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">{t("gabinet.reports.safeOutPeriod")}</p>
            <p className="mt-1 text-lg font-semibold">
              {formatCurrencyPLN(rangeOut, currency, { fractionDigits: 2 })}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Movement history in period */}
      <Card>
        <CardHeader className="border-b">
          <span className="font-semibold">{t("gabinet.safe.movements")}</span>
        </CardHeader>
        <CardContent className="overflow-x-auto pt-0">
          {movements.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-muted-foreground text-sm">
                {t("gabinet.reports.noSafeMovements")}
              </span>
            </div>
          ) : (
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-3 pr-4 font-medium text-muted-foreground">{t("common.date")}</th>
                  <th className="py-3 pr-4 font-medium text-muted-foreground">{t("gabinet.reports.safeMovementType")}</th>
                  <th className="py-3 pr-4 text-right font-medium text-muted-foreground">{t("gabinet.cash.amount")}</th>
                  <th className="py-3 font-medium text-muted-foreground">{t("gabinet.safe.description")}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 pr-4">
                      {new Date(m.createdAt).toLocaleDateString("pl-PL", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        m.type === "transfer_in"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                      }`}>
                        {m.type === "transfer_in"
                          ? t("gabinet.safe.typeTransferIn")
                          : t("gabinet.safe.typeWithdrawal")}
                      </span>
                    </td>
                    <td className={`py-3 pr-4 text-right font-medium ${m.type === "transfer_in" ? "text-green-700 dark:text-green-400" : "text-orange-700 dark:text-orange-400"}`}>
                      {m.type === "transfer_in" ? "+" : "−"}{formatCurrencyPLN(m.amount, currency, { fractionDigits: 2 })}
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {m.description ?? (m.referenceDayCloseId ? t("gabinet.safe.dayCloseRef") : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Main Page ─── */

function GabinetReports() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const { activeLocationId, setActiveLocationId } = useActiveLocation();
  const [dateRange, setDateRange] = useState<DateRangeKey>("30d");
  const [dateFilterPanelOpen, setDateFilterPanelOpen] = useState(false);
  const todayIso = new Date().toISOString().split("T")[0];
  const defaultCustomStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  }, []);
  const [customStart, setCustomStart] = useState<string>(defaultCustomStart);
  const [customEnd, setCustomEnd] = useState<string>(todayIso);
  const revenueSectionRef = useRef<HTMLDivElement>(null);
  const treatmentStatsSectionRef = useRef<HTMLDivElement>(null);

  const { startDate, endDate } = useMemo(() => {
    if (dateRange === "custom") {
      return { startDate: customStart, endDate: customEnd };
    }
    return getPresetDateRange(dateRange);
  }, [dateRange, customStart, customEnd]);

  const rangeLabel = useMemo(() => {
    const labels: Record<Exclude<DateRangeKey, "custom">, string> = {
      "today": t("gabinet.reports.today"),
      "yesterday": t("gabinet.reports.yesterday"),
      "7d": t("gabinet.reports.last7days"),
      "30d": t("gabinet.reports.last30days"),
      "90d": t("gabinet.reports.last90days"),
      "365d": t("gabinet.reports.lastYear"),
    };
    if (dateRange === "custom") {
      return `${customStart} – ${customEnd}`;
    }
    return labels[dateRange];
  }, [dateRange, customStart, customEnd, t]);

  useSidebarDispatch("filterByDate", () => setDateFilterPanelOpen(true));
  useSidebarDispatch("viewRevenueReport", () => {
    revenueSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  useSidebarDispatch("viewTreatmentStats", () => {
    treatmentStatsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const handleApplyCustomRange = useCallback(() => {
    if (!customStart || !customEnd) return;
    if (customStart > customEnd) {
      toast.error(t("common.invalidDateRange", "End date must be after start date"));
      return;
    }
    setDateRange("custom");
    setDateFilterPanelOpen(false);
  }, [customStart, customEnd, t]);

  const { data: locations } = useSupabaseGabinetLocationsList(organizationId, { activeOnly: true });

  const { data: appointments, isLoading: loadingAppointments } =
    useSupabaseGabinetAppointmentsByDateRange(organizationId, startDate, endDate, {
      locationId: activeLocationId ?? undefined,
    });

  const { data: treatments, isLoading: loadingTreatments } =
    useSupabaseGabinetTreatmentsList(organizationId);

  const { data: patients, isLoading: loadingPatients } =
    useSupabaseGabinetPatientsList(organizationId, { limit: 500, activeOnly: true });

  const { data: employees, isLoading: loadingEmployees } =
    useSupabaseGabinetEmployeesList(organizationId, { activeOnly: true });

  const completedAppointmentIds = useMemo(() => {
    if (!appointments) return [];
    return appointments
      .filter((a) => a.status === "completed")
      .map((a) => a._id);
  }, [appointments]);

  const { data: gratisBarterIds, isLoading: loadingGratisBarter } =
    useSupabaseGratisBarterAppointmentIds(organizationId, completedAppointmentIds);

  const { data: actualPayments, isLoading: loadingActualPayments } =
    useSupabasePaymentsRevenueByDateRange(organizationId, startDate, endDate, {
      locationId: activeLocationId ?? undefined,
    });

  const { data: packageUsages, isLoading: loadingPackageUsages } =
    useSupabaseGabinetPackageUsageByDateRange(organizationId, startDate, endDate);

  const { data: packagesListData, isLoading: loadingPackagesList } =
    useSupabaseGabinetTreatmentPackagesList(organizationId);

  const { data: dayClosesInRange, isLoading: loadingDayCloses } =
    useSupabaseGabinetDayClosesInRange(organizationId, startDate, endDate, {
      locationId: activeLocationId ?? undefined,
    });

  const { data: safeAllData, isLoading: loadingSafeAll } =
    useSupabaseGabinetSafeMovements(organizationId, activeLocationId ?? undefined);

  const { data: safeRangeData, isLoading: loadingSafeRange } =
    useSupabaseGabinetSafeMovementsInRange(
      organizationId,
      activeLocationId ?? undefined,
      startDate,
      endDate,
    );

  const { data: directSales, isLoading: loadingDirectSales } =
    useSupabaseDirectSalesByDateRange(organizationId, startDate, endDate, {
      locationId: activeLocationId ?? undefined,
    });

  const isLoading =
    loadingAppointments || loadingTreatments || loadingPatients || loadingEmployees || loadingGratisBarter || loadingActualPayments;

  // Treatment map: id → { name, price, currency }
  const treatmentMap = useMemo(() => {
    if (!treatments) return new Map<string, { name: string; price: number; currency: string }>();
    return new Map(
      treatments.map((tr) => [
        tr._id,
        { name: tr.name, price: tr.price, currency: tr.currency ?? "PLN" },
      ])
    );
  }, [treatments]);

  // Employee map: userId → name (for fallback attribution via createdBy)
  const employeeMap = useMemo(() => {
    if (!employees) return new Map<string, string>();
    return new Map(
      employees.map((e) => [
        e.userId,
        [e.firstName, e.lastName].filter(Boolean).join(" ") || e.userId,
      ])
    );
  }, [employees]);

  // Employee map: employeeId → name (for soldByEmployeeId attribution)
  const employeeMapById = useMemo(() => {
    if (!employees) return new Map<string, string>();
    return new Map(
      employees.map((e) => [
        e._id,
        [e.firstName, e.lastName].filter(Boolean).join(" ") || e._id,
      ])
    );
  }, [employees]);

  // Patient map: patientId → full name
  const patientMap = useMemo(() => {
    if (!patients) return new Map<string, string>();
    return new Map(
      patients.map((p) => [
        p._id,
        [p.firstName, p.lastName].filter(Boolean).join(" ") || p._id,
      ])
    );
  }, [patients]);

  // Package name map: packageId → name
  const packageNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of packagesListData ?? []) m.set(p._id, p.name);
    return m;
  }, [packagesListData]);

  // Treatment stats: count + estimated revenue (completed only, gratis/barter excluded from revenue)
  const treatmentStats = useMemo(
    () => computeTreatmentStats(appointments ?? [], treatmentMap, gratisBarterIds ?? new Set()),
    [appointments, treatmentMap, gratisBarterIds]
  );

  const topByRevenue = useMemo(
    () =>
      [...treatmentStats]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
    [treatmentStats]
  );

  // Status distribution
  const statusStats = useMemo(
    () => computeStatusStats(appointments ?? []),
    [appointments]
  );

  // Daily appointment counts
  const dailyStats = useMemo(
    () => computeDailyStats(appointments ?? []),
    [appointments]
  );

  // Employee utilization
  const employeeStats = useMemo(
    () => computeEmployeeStats(appointments ?? [], employeeMap, treatmentMap, gratisBarterIds ?? new Set()),
    [appointments, employeeMap, treatmentMap, gratisBarterIds]
  );

  // Revenue: relative to the selected date range (endDate = last day of range)
  const sevenDaysBeforeEnd = useMemo(() => {
    const d = new Date(endDate);
    d.setDate(d.getDate() - 6);
    return d.toISOString().split("T")[0];
  }, [endDate]);

  const { totalRevenue, last7Revenue, lastDayRevenue, defaultCurrency } =
    useMemo(() => {
      let total = 0,
        last7 = 0,
        lastDay = 0;
      let currency = "PLN";
      if (appointments) {
        for (const a of appointments) {
          if (a.status !== "completed") continue;
          if (gratisBarterIds?.has(a._id)) continue;
          const tid = a.treatmentId as string;
          const tr = treatmentMap.get(tid);
          if (!tr) continue;
          const price = (a.priceAtBooking as number | undefined) ?? tr.price;
          currency = tr.currency;
          total += price;
          if (a.date >= sevenDaysBeforeEnd) last7 += price;
          if (a.date === endDate) lastDay += price;
        }
      }
      return {
        totalRevenue: total,
        last7Revenue: last7,
        lastDayRevenue: lastDay,
        defaultCurrency: currency,
      };
    }, [appointments, treatmentMap, sevenDaysBeforeEnd, endDate, gratisBarterIds]);

  const { actualTotal, actualLast7, actualLastDay } = useMemo(() => {
    let total = 0, last7 = 0, lastDay = 0;
    if (actualPayments) {
      const sevenDaysBeforeEndTs = new Date(sevenDaysBeforeEnd + "T00:00:00.000Z").getTime();
      const endDayStartTs = new Date(endDate + "T00:00:00.000Z").getTime();
      for (const p of actualPayments) {
        total += p.amount;
        if (p.paidAt >= sevenDaysBeforeEndTs) last7 += p.amount;
        if (p.paidAt >= endDayStartTs) lastDay += p.amount;
      }
    }
    return { actualTotal: total, actualLast7: last7, actualLastDay: lastDay };
  }, [actualPayments, sevenDaysBeforeEnd, endDate]);

  // Maps raw payment_method values to display categories (cash/card/transfer/package/other)
  const paymentMethodBreakdown = useMemo(
    () => computePaymentMethodBreakdown(actualPayments ?? []),
    [actualPayments]
  );

  const totalAppointments = appointments?.length ?? 0;
  const completedCount =
    appointments?.filter((a) => a.status === "completed").length ?? 0;
  const cancelledCount =
    appointments?.filter((a) => a.status === "cancelled").length ?? 0;
  const completionRate =
    totalAppointments > 0
      ? Math.round((completedCount / totalAppointments) * 100)
      : 0;
  const totalPatients = patients?.length ?? 0;

  const dailyChartPoints = useMemo(
    () => bucketizePairs(dailyStats.map((d) => [d.date, d.count])),
    [dailyStats]
  );

  const completedChartPoints = useMemo(() => {
    if (!appointments) return Array.from({ length: 7 }, (_, i) => ({ index: i, count: 0 }));
    const map = new Map<string, number>();
    for (const a of appointments)
      if (a.status === "completed")
        map.set(a.date, (map.get(a.date) ?? 0) + 1);
    return bucketizePairs(Array.from(map.entries()));
  }, [appointments]);

  const cancelledChartPoints = useMemo(() => {
    if (!appointments) return Array.from({ length: 7 }, (_, i) => ({ index: i, count: 0 }));
    const map = new Map<string, number>();
    for (const a of appointments)
      if (a.status === "cancelled")
        map.set(a.date, (map.get(a.date) ?? 0) + 1);
    return bucketizePairs(Array.from(map.entries()));
  }, [appointments]);

  const revenueChartPoints = useMemo(() => {
    if (!appointments) return Array.from({ length: 7 }, (_, i) => ({ index: i, count: 0 }));
    const map = new Map<string, number>();
    for (const a of appointments) {
      if (a.status !== "completed") continue;
      if (gratisBarterIds?.has(a._id)) continue;
      const tid = a.treatmentId as string;
      const price = a.priceAtBooking ?? treatmentMap.get(tid)?.price ?? 0;
      map.set(a.date, (map.get(a.date) ?? 0) + price);
    }
    return bucketizePairs(Array.from(map.entries()));
  }, [appointments, treatmentMap, gratisBarterIds]);

  const handleExportReport = useCallback(() => {
    type Row = {
      section: string;
      metric: string;
      value: number | string;
      revenue: number | string;
    };
    const rows: Row[] = [];
    rows.push({ section: "summary", metric: "totalAppointments", value: totalAppointments, revenue: "" });
    rows.push({ section: "summary", metric: "completed", value: completedCount, revenue: "" });
    rows.push({ section: "summary", metric: "cancelled", value: cancelledCount, revenue: "" });
    rows.push({ section: "summary", metric: "totalPatients", value: totalPatients, revenue: "" });
    rows.push({ section: "summary", metric: "completionRate", value: completionRate, revenue: "" });
    rows.push({ section: "revenue_estimated", metric: "lastDay", value: lastDayRevenue, revenue: "" });
    rows.push({ section: "revenue_estimated", metric: "last7days", value: last7Revenue, revenue: "" });
    rows.push({ section: "revenue_estimated", metric: "total", value: totalRevenue, revenue: "" });
    rows.push({ section: "revenue_actual", metric: "lastDay", value: actualLastDay, revenue: "" });
    rows.push({ section: "revenue_actual", metric: "last7days", value: actualLast7, revenue: "" });
    rows.push({ section: "revenue_actual", metric: "total", value: actualTotal, revenue: "" });
    for (const tr of treatmentStats) {
      rows.push({ section: "treatment", metric: tr.name, value: tr.count, revenue: tr.revenue });
    }
    for (const s of statusStats) {
      rows.push({ section: "status", metric: s.status, value: s.count, revenue: "" });
    }
    for (const d of dailyStats) {
      rows.push({ section: "daily", metric: d.date, value: d.count, revenue: "" });
    }
    for (const e of employeeStats) {
      rows.push({
        section: "employee",
        metric: e.name,
        value: e.count,
        revenue: e.revenue,
      });
    }
    for (const pm of paymentMethodBreakdown) {
      rows.push({ section: "payment_method", metric: pm.method, value: pm.count, revenue: pm.total });
    }
    // Package sales — per package and per employee
    const pkgSalesMap = new Map<string, { count: number; revenue: number }>();
    const empPkgSalesMap = new Map<string, { count: number; revenue: number; isByEmployeeId: boolean }>();
    for (const u of packageUsages ?? []) {
      const prevPkg = pkgSalesMap.get(u.packageId) ?? { count: 0, revenue: 0 };
      pkgSalesMap.set(u.packageId, { count: prevPkg.count + 1, revenue: prevPkg.revenue + u.paidAmount });
      const empKey = u.soldByEmployeeId ?? u.createdBy;
      const isByEmployeeId = !!u.soldByEmployeeId;
      const prevEmp = empPkgSalesMap.get(empKey) ?? { count: 0, revenue: 0, isByEmployeeId };
      empPkgSalesMap.set(empKey, { count: prevEmp.count + 1, revenue: prevEmp.revenue + u.paidAmount, isByEmployeeId });
    }
    for (const [pkgId, stats] of pkgSalesMap) {
      rows.push({ section: "package_sales_by_package", metric: packageNameMap.get(pkgId) ?? pkgId, value: stats.count, revenue: stats.revenue });
    }
    for (const [key, stats] of empPkgSalesMap) {
      const name = stats.isByEmployeeId
        ? (employeeMapById.get(key) ?? key)
        : (employeeMap.get(key) ?? key);
      rows.push({ section: "package_sales_by_employee", metric: name, value: stats.count, revenue: stats.revenue });
    }
    // Product sales (direct_sale) — per product and per employee
    const sales = (directSales ?? []).filter((m) => m.reason === "direct_sale");
    const returns = (directSales ?? []).filter((m) => m.reason === "direct_sale_return");
    const totalProductRevenue = sales.reduce((s, m) => s + m.revenue, 0);
    const totalReturnsRevenue = returns.reduce((s, m) => s + m.revenue, 0);
    rows.push({ section: "product_sales", metric: "totalRevenue", value: "", revenue: totalProductRevenue });
    rows.push({ section: "product_sales", metric: "totalReturns", value: "", revenue: totalReturnsRevenue });
    rows.push({ section: "product_sales", metric: "netRevenue", value: "", revenue: totalProductRevenue - totalReturnsRevenue });
    const productSalesMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const m of sales) {
      const prev = productSalesMap.get(m.productId) ?? { name: m.productName, quantity: 0, revenue: 0 };
      productSalesMap.set(m.productId, { name: m.productName, quantity: prev.quantity + m.quantity, revenue: prev.revenue + m.revenue });
    }
    for (const stats of productSalesMap.values()) {
      rows.push({ section: "product_sales_by_product", metric: stats.name, value: stats.quantity, revenue: stats.revenue });
    }
    const empProductSalesMap = new Map<string, { quantity: number; revenue: number }>();
    for (const m of sales) {
      const key = m.employeeId ?? "__unknown__";
      const prev = empProductSalesMap.get(key) ?? { quantity: 0, revenue: 0 };
      empProductSalesMap.set(key, { quantity: prev.quantity + m.quantity, revenue: prev.revenue + m.revenue });
    }
    for (const [key, stats] of empProductSalesMap) {
      const name = key === "__unknown__" ? "Unknown" : (employeeMapById.get(key) ?? key);
      rows.push({ section: "product_sales_by_employee", metric: name, value: stats.quantity, revenue: stats.revenue });
    }
    const { breakdown: productPaymentBreakdown, unattributedReturnAmount: csvUnattributed } =
      computeDirectSalesPaymentBreakdown(sales, returns);
    for (const pm of productPaymentBreakdown) {
      if (pm.count > 0 || pm.total !== 0)
        rows.push({ section: "product_sales_payment_method", metric: pm.method, value: pm.count, revenue: pm.total });
    }
    if (csvUnattributed > 0) {
      rows.push({ section: "product_sales_payment_method", metric: "unattributed_returns", value: "", revenue: -csvUnattributed });
    }
    const csv = Papa.unparse(rows as unknown as Record<string, unknown>[]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gabinet_report_${startDate}_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(t("nav.actions.exportReport"));
  }, [
    totalAppointments,
    completedCount,
    cancelledCount,
    totalPatients,
    completionRate,
    lastDayRevenue,
    last7Revenue,
    totalRevenue,
    actualLastDay,
    actualLast7,
    actualTotal,
    treatmentStats,
    statusStats,
    dailyStats,
    employeeStats,
    paymentMethodBreakdown,
    packageUsages,
    packageNameMap,
    employeeMap,
    employeeMapById,
    directSales,
    startDate,
    endDate,
    t,
  ]);

  useSidebarDispatch("exportReport", handleExportReport);

  // Restore scroll position after focus return (screenshot, app switch, etc.)
  useEffect(() => {
    const STORAGE_KEY = "gabinet-reports-scroll-y";
    const onScroll = () =>
      sessionStorage.setItem(STORAGE_KEY, String(window.scrollY));
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved !== null) window.scrollTo({ top: parseInt(saved, 10) });
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title={t("gabinet.reports.title")}
          description={t("gabinet.reports.description")}
        />
        <div className="flex gap-2 shrink-0">
          {locations && locations.length > 0 && (
            <Select
              value={activeLocationId ?? "all"}
              onValueChange={(v) => setActiveLocationId(v === "all" ? null : v)}
            >
              <SelectTrigger className="w-40" aria-label={t("gabinet.reports.location", "Location")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("gabinet.reports.allLocations", "All locations")}</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc._id} value={loc._id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select
            value={dateRange}
            onValueChange={(v) => {
              if (v === "custom") {
                setDateFilterPanelOpen(true);
                return;
              }
              setDateRange(v as DateRangeKey);
            }}
          >
            <SelectTrigger className="w-40" aria-label={t("gabinet.reports.dateRange")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{t("gabinet.reports.today")}</SelectItem>
              <SelectItem value="yesterday">{t("gabinet.reports.yesterday")}</SelectItem>
              <SelectItem value="7d">{t("gabinet.reports.last7days")}</SelectItem>
              <SelectItem value="30d">{t("gabinet.reports.last30days")}</SelectItem>
              <SelectItem value="90d">{t("gabinet.reports.last90days")}</SelectItem>
              <SelectItem value="365d">{t("gabinet.reports.lastYear")}</SelectItem>
              <SelectItem value="custom">{t("common.custom", "Custom")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatisticsOrderCard
          title={t("gabinet.reports.totalAppointments")}
          description={rangeLabel}
          value={totalAppointments.toLocaleString()}
          changePercentage={`${completionRate}% ${t("gabinet.reports.completionRate")}`}
          chartData={dailyChartPoints.map((d) => ({ day: String(d.index), orders: d.count }))}
        />
        <StatisticsSalesGrowthCard
          title={t("gabinet.reports.completed")}
          description={`${completionRate}% ${t("gabinet.reports.completionRate")}`}
          value={completedCount.toLocaleString()}
          changePercentage={rangeLabel}
          chartData={completedChartPoints.map((d) => ({ date: String(d.index), sales: d.count }))}
          gradientId="fillCompleted"
        />
        <StatisticsProfitCard
          title={t("gabinet.reports.cancelled")}
          description={rangeLabel}
          value={cancelledCount.toLocaleString()}
          changePercentage={
            totalAppointments > 0
              ? `${Math.round((cancelledCount / totalAppointments) * 100)}%`
              : "0%"
          }
          chartData={cancelledChartPoints.map((d) => ({ month: String(d.index), profit: d.count }))}
        />
        <StatisticsImpressionCard
          title={t("gabinet.reports.totalPatients")}
          description={activeLocationId ? t("gabinet.reports.allClientsOrgWide") : t("gabinet.reports.allClientsInSystem")}
          value={totalPatients.toLocaleString()}
          changePercentage={activeLocationId ? t("gabinet.reports.allClientsOrgWide") : t("gabinet.reports.allClientsInSystem")}
          chartData={revenueChartPoints.map((d) => ({ month: String(d.index), impression: d.count }))}
        />
      </div>

      {/* Revenue Summary */}
      <div ref={revenueSectionRef} className="scroll-mt-6">
        <RevenueSummaryCard
          lastDayRevenue={lastDayRevenue}
          last7Revenue={last7Revenue}
          totalRevenue={totalRevenue}
          currency={defaultCurrency}
          actualLastDay={actualLastDay}
          actualLast7={actualLast7}
          actualTotal={actualTotal}
        />
      </div>

      {/* Payment Methods Breakdown */}
      <PaymentMethodsCard
        data={paymentMethodBreakdown}
        currency={defaultCurrency}
        rangeLabel={rangeLabel}
      />

      {/* Treatment Popularity + Status Distribution */}
      <div ref={treatmentStatsSectionRef} className="grid gap-6 lg:grid-cols-2 scroll-mt-6">
        <TreatmentPopularityChart data={treatmentStats} rangeLabel={rangeLabel} />
        <StatusDistributionChart
          data={statusStats}
          total={totalAppointments}
        />
      </div>

      {/* Top Treatments by Revenue + Employee Utilization */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TopTreatmentsByRevenue data={topByRevenue} rangeLabel={rangeLabel} />
        <EmployeeUtilizationChart data={employeeStats} rangeLabel={rangeLabel} />
      </div>

      {/* Daily Appointment Volume */}
      <DailyVolumeChart data={dailyStats} rangeLabel={rangeLabel} />

      {/* Package Sales */}
      <PackageSalesSection
        usages={packageUsages ?? []}
        isLoading={loadingPackageUsages || loadingPackagesList}
        packages={packagesListData ?? []}
        packageNameMap={packageNameMap}
        employeeMap={employeeMap}
        employeeMapById={employeeMapById}
        patientMap={patientMap}
        rangeLabel={rangeLabel}
        currency={defaultCurrency}
        startDate={startDate}
        endDate={endDate}
      />

      {/* Product Sales (direct_sale) */}
      <ProductSalesSection
        movements={directSales ?? []}
        isLoading={loadingDirectSales}
        employeeMapById={employeeMapById}
        rangeLabel={rangeLabel}
        currency={defaultCurrency}
      />

      {/* Kasa — Cash Register Report */}
      <CashRegisterReportSection
        dayCloses={dayClosesInRange ?? []}
        isLoading={loadingDayCloses}
        rangeLabel={rangeLabel}
        currency={defaultCurrency}
      />

      {/* Sejf — Safe Report */}
      <SafeReportSection
        safeAll={safeAllData}
        safeRange={safeRangeData}
        isLoadingAll={loadingSafeAll}
        isLoadingRange={loadingSafeRange}
        locationId={activeLocationId}
        rangeLabel={rangeLabel}
        currency={defaultCurrency}
      />

      <SidePanel
        open={dateFilterPanelOpen}
        onOpenChange={setDateFilterPanelOpen}
        title={t("nav.actions.filterByDate")}
        onSubmit={handleApplyCustomRange}
        submitLabel={t("common.apply", "Apply")}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="report-custom-start">{t("common.startDate")}</FieldLabel>
            <Input
              id="report-custom-start"
              type="date"
              value={customStart}
              max={customEnd || undefined}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="report-custom-end">{t("common.endDate")}</FieldLabel>
            <Input
              id="report-custom-end"
              type="date"
              value={customEnd}
              min={customStart || undefined}
              max={todayIso}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
        </div>
      </SidePanel>
    </div>
  );
}
