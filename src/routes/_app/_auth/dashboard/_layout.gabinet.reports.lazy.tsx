import { createLazyFileRoute } from "@tanstack/react-router";
import Papa from "papaparse";
import { toast } from "sonner";
import { useSupabaseGabinetAppointmentsByDateRange } from "@/hooks/use-supabase-gabinet-appointments";
import {
  useSupabaseGratisBarterAppointmentIds,
  useSupabasePaymentsRevenueByDateRange,
} from "@/hooks/use-supabase-payments";
import { useSupabaseGabinetTreatmentsList } from "@/hooks/use-supabase-gabinet-treatments";
import { useSupabaseGabinetPatientsList } from "@/hooks/use-supabase-gabinet-patients";
import { useSupabaseGabinetEmployeesList } from "@/hooks/use-supabase-gabinet-employees";
import { useOrganization } from "@/components/org-context";
import { usePermission } from "@/hooks/use-permission";
import { formatCurrencyPLN } from "@/lib/format-currency";
import { PageHeader } from "@/components/layout/page-header";
import { SidePanel } from "@/components/crm/side-panel";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export const Route = createLazyFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/reports"
)({
  component: GabinetReports,
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

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "other"
  );
}

function bucketizePairs(
  pairs: [string, number][],
): { index: number; count: number }[] {
  if (!pairs.length)
    return Array.from({ length: 7 }, (_, i) => ({ index: i, count: 0 }));
  const sorted = [...pairs].sort((a, b) => a[0].localeCompare(b[0]));
  const bucketSize = Math.max(1, Math.ceil(sorted.length / 7));
  const buckets: { index: number; count: number }[] = [];
  for (let i = 0; i < sorted.length; i += bucketSize) {
    const slice = sorted.slice(i, i + bucketSize);
    buckets.push({
      index: buckets.length,
      count: slice.reduce((s, d) => s + d[1], 0),
    });
  }
  return buckets;
}

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
  data: { name: string; count: number; completedCount: number }[];
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
                    <span className="text-sm text-muted-foreground ml-2 shrink-0">
                      {emp.count} {t("gabinet.reports.appointmentsShort")}
                    </span>
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

/* ─── Main Page ─── */

function GabinetReports() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const { allowed: canViewReports, loading: permLoading } = usePermission("gabinet_reports", "view");

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

  const { data: appointments, isLoading: loadingAppointments } =
    useSupabaseGabinetAppointmentsByDateRange(organizationId, startDate, endDate);

  const { data: treatments, isLoading: loadingTreatments } =
    useSupabaseGabinetTreatmentsList(organizationId);

  const { data: patients, isLoading: loadingPatients } =
    useSupabaseGabinetPatientsList(organizationId, { limit: 500 });

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
    useSupabasePaymentsRevenueByDateRange(organizationId, startDate, endDate);

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

  // Employee map: userId → name
  const employeeMap = useMemo(() => {
    if (!employees) return new Map<string, string>();
    return new Map(
      employees.map((e) => [
        e.userId,
        [e.firstName, e.lastName].filter(Boolean).join(" ") || e.userId,
      ])
    );
  }, [employees]);

  // Treatment stats: count + estimated revenue (completed only, gratis/barter excluded from revenue)
  const treatmentStats = useMemo(() => {
    if (!appointments) return [];
    const map = new Map<string, { count: number; revenue: number }>();
    for (const a of appointments) {
      const tid = a.treatmentId as string;
      const prev = map.get(tid) ?? { count: 0, revenue: 0 };
      const price = a.status === "completed" && !gratisBarterIds?.has(a._id)
        ? (a.priceAtBooking ?? treatmentMap.get(tid)?.price ?? 0)
        : 0;
      map.set(tid, { count: prev.count + 1, revenue: prev.revenue + price });
    }
    return Array.from(map.entries())
      .map(([id, stats]) => ({
        name: treatmentMap.get(id)?.name ?? id,
        count: stats.count,
        revenue: stats.revenue,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [appointments, treatmentMap, gratisBarterIds]);

  const topByRevenue = useMemo(
    () =>
      [...treatmentStats]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
    [treatmentStats]
  );

  // Status distribution
  const statusStats = useMemo(() => {
    if (!appointments) return [];
    const map = new Map<string, number>();
    for (const a of appointments) {
      map.set(a.status, (map.get(a.status) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [appointments]);

  // Daily appointment counts
  const dailyStats = useMemo(() => {
    if (!appointments) return [];
    const map = new Map<string, number>();
    for (const a of appointments) {
      map.set(a.date, (map.get(a.date) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [appointments]);

  // Employee utilization
  const employeeStats = useMemo(() => {
    if (!appointments) return [];
    const map = new Map<string, { count: number; completedCount: number }>();
    for (const a of appointments) {
      const uid = a.employeeId as string;
      const prev = map.get(uid) ?? { count: 0, completedCount: 0 };
      map.set(uid, {
        count: prev.count + 1,
        completedCount:
          prev.completedCount + (a.status === "completed" ? 1 : 0),
      });
    }
    return Array.from(map.entries())
      .map(([userId, stats]) => ({
        name: employeeMap.get(userId) ?? userId,
        count: stats.count,
        completedCount: stats.completedCount,
      }))
      .sort((a, b) => b.count - a.count);
  }, [appointments, employeeMap]);

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
  const paymentMethodBreakdown = useMemo(() => {
    const categoryOf = (method: string | undefined): string => {
      if (method === "cash" || method === "card" || method === "transfer" || method === "package")
        return method;
      return "other";
    };
    const map = new Map<string, { total: number; count: number }>();
    for (const p of actualPayments ?? []) {
      const cat = categoryOf(p.paymentMethod);
      const prev = map.get(cat) ?? { total: 0, count: 0 };
      map.set(cat, { total: prev.total + p.amount, count: prev.count + 1 });
    }
    return (["cash", "card", "transfer", "package", "other"] as const).map((key) => ({
      method: key,
      total: map.get(key)?.total ?? 0,
      count: map.get(key)?.count ?? 0,
    }));
  }, [actualPayments]);

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
        revenue: e.completedCount,
      });
    }
    for (const pm of paymentMethodBreakdown) {
      rows.push({ section: "payment_method", metric: pm.method, value: pm.count, revenue: pm.total });
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

  if (permLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        <Skeleton className="h-10 w-64" />
      </div>
    );
  }

  if (!canViewReports) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        <PageHeader
          title={t("gabinet.reports.title")}
          description={t("common.noPermission", "You don't have permission to view this page.")}
        />
      </div>
    );
  }

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
          <SelectTrigger className="w-40 shrink-0" aria-label={t("gabinet.reports.dateRange")}>
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
          description={t("gabinet.reports.allClientsInSystem")}
          value={totalPatients.toLocaleString()}
          changePercentage={t("gabinet.reports.allClientsInSystem")}
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
