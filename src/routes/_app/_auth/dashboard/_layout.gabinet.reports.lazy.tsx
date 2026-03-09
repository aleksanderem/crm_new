import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EllipsisVerticalIcon } from "@/lib/ez-icons";
import {
  Area,
  AreaChart,
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
  CardDescription,
  CardHeader,
  CardTitle,
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

export const Route = createLazyFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/reports"
)({
  component: GabinetReports,
});

const listItems = ["Share", "Update", "Refresh"];

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

type DateRangeKey = "7d" | "30d" | "90d" | "365d";

function getDateRange(key: DateRangeKey): { startDate: string; endDate: string } {
  const today = new Date();
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

function formatCurrency(amount: number, currency = "PLN") {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-6 rounded-full"
        >
          <EllipsisVerticalIcon className="h-4 w-4" variant="stroke" />
          <span className="sr-only">Menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {listItems.map((item, index) => (
            <DropdownMenuItem key={index}>{item}</DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── KPI Statistics Card ─── */

function KpiStatCard({
  title,
  description,
  value,
  chartData,
  chartType,
}: {
  title: string;
  description: string;
  value: string;
  chartData: { index: number; count: number }[];
  chartType: "bar" | "area";
}) {
  const gradientId = useId();
  const chartConfig = {
    count: { label: title, color: "var(--chart-2)" },
  } satisfies ChartConfig;

  return (
    <Card className="gap-4">
      <CardHeader className="gap-1">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <span className="text-2xl font-semibold">{value}</span>
        <CardDescription className="text-muted-foreground text-sm">
          {description}
        </CardDescription>
      </CardHeader>

      <ChartContainer
        config={chartConfig}
        className="h-21 w-full overflow-hidden px-2.75"
      >
        {chartType === "bar" ? (
          <BarChart
            accessibilityLayer
            data={chartData}
            barSize={12}
            margin={{ left: 0, right: 0 }}
          >
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              background={{
                fill: "color-mix(in oklab, var(--primary) 10%, transparent)",
                radius: 12,
              }}
              radius={12}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
          </BarChart>
        ) : (
          <AreaChart
            data={chartData}
            margin={{ left: 0, right: 0 }}
            className="stroke-2"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="10%"
                  stopColor="var(--chart-2)"
                  stopOpacity={0.4}
                />
                <stop
                  offset="90%"
                  stopColor="var(--chart-2)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Area
              dataKey="count"
              type="natural"
              fill={`url(#${gradientId})`}
              stroke="var(--chart-2)"
              stackId="a"
            />
          </AreaChart>
        )}
      </ChartContainer>
    </Card>
  );
}

/* ─── Revenue Summary Card ─── */

function RevenueSummaryCard({
  dailyRevenue,
  weeklyRevenue,
  monthlyRevenue,
  currency,
}: {
  dailyRevenue: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
  currency: string;
}) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader className="flex justify-between border-b">
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold">
            {t("gabinet.reports.revenue")}
          </span>
          <span className="text-muted-foreground text-sm">
            {t("gabinet.reports.estimatedFromCompletedAppointments")}
          </span>
        </div>
        <CardMenu />
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-4 pt-4">
        <div className="flex flex-col gap-1 border-r pr-4 last:border-r-0">
          <span className="text-muted-foreground text-sm">
            {t("gabinet.reports.today")}
          </span>
          <span className="text-xl font-semibold">
            {formatCurrency(dailyRevenue, currency)}
          </span>
        </div>
        <div className="flex flex-col gap-1 border-r pr-4 last:border-r-0">
          <span className="text-muted-foreground text-sm">
            {t("gabinet.reports.thisWeek")}
          </span>
          <span className="text-xl font-semibold">
            {formatCurrency(weeklyRevenue, currency)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-sm">
            {t("gabinet.reports.thisMonth")}
          </span>
          <span className="text-xl font-semibold">
            {formatCurrency(monthlyRevenue, currency)}
          </span>
        </div>
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
      <CardContent className="flex flex-1">
        <ChartContainer
          config={treatmentChartConfig}
          className="min-h-80 w-full"
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
        label: item.status.replace("_", " "),
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
                            Top {top.length}
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
                  {item.status.replace("_", " ")}
                </span>
                <span className="text-muted-foreground text-sm">
                  {total > 0
                    ? `${Math.round((item.count / total) * 100)}% of total`
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

const dailyChartConfig = {
  count: { label: "Appointments" },
} satisfies ChartConfig;

function DailyVolumeChart({
  data,
  rangeLabel,
}: {
  data: { date: string; count: number }[];
  rangeLabel: string;
}) {
  const { t } = useTranslation();

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
      <CardContent>
        <ChartContainer config={dailyChartConfig} className="h-45 w-full">
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

        <ChartContainer config={utilizationConfig} className="mt-6 h-45 w-full">
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
                    {formatCurrency(item.revenue)}
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
  const [dateRange, setDateRange] = useState<DateRangeKey>("30d");

  const { startDate, endDate } = useMemo(
    () => getDateRange(dateRange),
    [dateRange]
  );

  const rangeLabel = useMemo(() => {
    const labels: Record<DateRangeKey, string> = {
      "7d": t("gabinet.reports.last7days"),
      "30d": t("gabinet.reports.last30days"),
      "90d": t("gabinet.reports.last90days"),
      "365d": t("gabinet.reports.lastYear"),
    };
    return labels[dateRange];
  }, [dateRange, t]);

  const { data: appointments, isLoading: loadingAppointments } = useQuery(
    convexQuery(api.gabinet.appointments.listByDateRange, {
      organizationId,
      startDate,
      endDate,
    })
  );

  const { data: treatments, isLoading: loadingTreatments } = useQuery(
    convexQuery(api.gabinet.treatments.listActive, { organizationId })
  );

  const { data: patients, isLoading: loadingPatients } = useQuery(
    convexQuery(api.gabinet.patients.list, {
      organizationId,
      paginationOpts: { numItems: 500, cursor: null },
    })
  );

  const { data: employees, isLoading: loadingEmployees } = useQuery(
    convexQuery(api.gabinet.employees.listAll, {
      organizationId,
      activeOnly: true,
    })
  );

  const isLoading =
    loadingAppointments || loadingTreatments || loadingPatients || loadingEmployees;

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

  // Treatment stats: count + estimated revenue (completed only)
  const treatmentStats = useMemo(() => {
    if (!appointments) return [];
    const map = new Map<string, { count: number; revenue: number }>();
    for (const a of appointments) {
      const tid = a.treatmentId as string;
      const prev = map.get(tid) ?? { count: 0, revenue: 0 };
      const price = a.status === "completed"
        ? (treatmentMap.get(tid)?.price ?? 0)
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
  }, [appointments, treatmentMap]);

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

  // Revenue: daily, weekly, monthly (from completed appointments × treatment price)
  const today = new Date().toISOString().split("T")[0];
  const weekStart = (() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split("T")[0];
  })();
  const monthStart = (() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  })();

  const { dailyRevenue, weeklyRevenue, monthlyRevenue, defaultCurrency } =
    useMemo(() => {
      let daily = 0,
        weekly = 0,
        monthly = 0;
      let currency = "PLN";
      if (appointments) {
        for (const a of appointments) {
          if (a.status !== "completed") continue;
          const tid = a.treatmentId as string;
          const tr = treatmentMap.get(tid);
          if (!tr) continue;
          const price = tr.price;
          currency = tr.currency;
          if (a.date === today) daily += price;
          if (a.date >= weekStart) weekly += price;
          if (a.date >= monthStart) monthly += price;
        }
      }
      return {
        dailyRevenue: daily,
        weeklyRevenue: weekly,
        monthlyRevenue: monthly,
        defaultCurrency: currency,
      };
    }, [appointments, treatmentMap, today, weekStart, monthStart]);

  const totalAppointments = appointments?.length ?? 0;
  const completedCount =
    appointments?.filter((a) => a.status === "completed").length ?? 0;
  const cancelledCount =
    appointments?.filter((a) => a.status === "cancelled").length ?? 0;
  const completionRate =
    totalAppointments > 0
      ? Math.round((completedCount / totalAppointments) * 100)
      : 0;
  const totalPatients = patients?.page?.length ?? 0;

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
      const tid = a.treatmentId as string;
      const price = treatmentMap.get(tid)?.price ?? 0;
      map.set(a.date, (map.get(a.date) ?? 0) + price);
    }
    return bucketizePairs(Array.from(map.entries()));
  }, [appointments, treatmentMap]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
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
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title={t("gabinet.reports.title")}
          description={t("gabinet.reports.description")}
        />
        <Select
          value={dateRange}
          onValueChange={(v) => setDateRange(v as DateRangeKey)}
        >
          <SelectTrigger className="w-40 shrink-0" aria-label={t("gabinet.reports.dateRange")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">{t("gabinet.reports.last7days")}</SelectItem>
            <SelectItem value="30d">{t("gabinet.reports.last30days")}</SelectItem>
            <SelectItem value="90d">{t("gabinet.reports.last90days")}</SelectItem>
            <SelectItem value="365d">{t("gabinet.reports.lastYear")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiStatCard
          title={t("gabinet.reports.totalAppointments")}
          description={rangeLabel}
          value={totalAppointments.toLocaleString()}
          chartData={dailyChartPoints}
          chartType="bar"
        />
        <KpiStatCard
          title={t("gabinet.reports.completed")}
          description={`${completionRate}% ${t("gabinet.reports.completionRate")}`}
          value={completedCount.toLocaleString()}
          chartData={completedChartPoints}
          chartType="area"
        />
        <KpiStatCard
          title={t("gabinet.reports.cancelled")}
          description={rangeLabel}
          value={cancelledCount.toLocaleString()}
          chartData={cancelledChartPoints}
          chartType="bar"
        />
        <KpiStatCard
          title={t("gabinet.reports.totalPatients")}
          description={rangeLabel}
          value={totalPatients.toLocaleString()}
          chartData={revenueChartPoints}
          chartType="area"
        />
      </div>

      {/* Revenue Summary */}
      <RevenueSummaryCard
        dailyRevenue={dailyRevenue}
        weeklyRevenue={weeklyRevenue}
        monthlyRevenue={monthlyRevenue}
        currency={defaultCurrency}
      />

      {/* Treatment Popularity + Status Distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
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
    </div>
  );
}
