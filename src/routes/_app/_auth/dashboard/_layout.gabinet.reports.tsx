import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { useId, useMemo } from "react";
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

export const Route = createFileRoute(
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

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "other"
  );
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
          <EllipsisVerticalIcon />
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

/* ─── KPI Statistics Card (statistics-order-card pattern) ─── */

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
  chartType: "bar" | "area" | "line";
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

      <ChartContainer config={chartConfig} className="h-21 w-full overflow-hidden px-2.75">
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

/* ─── Treatment Popularity (horizontal bar – CountrySalesCard pattern) ─── */

const treatmentChartConfig = {
  count: { label: "Appointments", color: "var(--primary)" },
} satisfies ChartConfig;

function TreatmentPopularityChart({
  data,
}: {
  data: { name: string; count: number }[];
}) {
  const { t } = useTranslation();

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
          <span className="text-muted-foreground text-sm">
            {t("gabinet.reports.last30days")}
          </span>
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

/* ─── Status Distribution (donut – TotalOrdersCard pattern) ─── */

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
    const config: ChartConfig = { count: { label: "Appointments" } };
    const items = top.map((item, i) => {
      const key = slugify(item.status);
      config[key] = {
        label: item.status.replace("_", " "),
        color: DONUT_COLORS[i % DONUT_COLORS.length],
      };
      return { category: key, count: item.count, fill: `var(--color-${key})` };
    });
    return { chartData: items, chartConfig: config };
  }, [top]);

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

/* ─── Daily Volume (bar chart – EarningReportCard pattern) ─── */

const dailyChartConfig = {
  count: { label: "Appointments" },
} satisfies ChartConfig;

function DailyVolumeChart({
  data,
}: {
  data: { date: string; count: number }[];
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
          <span className="text-muted-foreground text-sm">
            {t("gabinet.reports.last30days")}
          </span>
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

/* ─── Main Page ─── */

function GabinetReports() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split("T")[0];
  const endDate = today.toISOString().split("T")[0];

  const { data: appointments } = useQuery(
    convexQuery(api["gabinet/appointments"].listByDateRange, {
      organizationId,
      startDate,
      endDate,
    })
  );

  const { data: treatments } = useQuery(
    convexQuery(api["gabinet/treatments"].listActive, { organizationId })
  );

  const { data: patients } = useQuery(
    convexQuery(api["gabinet/patients"].list, {
      organizationId,
      paginationOpts: { numItems: 500, cursor: null },
    })
  );

  // Treatment popularity
  const treatmentStats = useMemo(() => {
    if (!appointments || !treatments) return [];
    const countMap = new Map<string, number>();
    for (const a of appointments) {
      countMap.set(a.treatmentId, (countMap.get(a.treatmentId) ?? 0) + 1);
    }
    const treatmentNameMap = new Map(treatments.map((tr) => [tr._id, tr.name]));
    return Array.from(countMap.entries())
      .map(([id, count]) => ({ name: treatmentNameMap.get(id) ?? id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [appointments, treatments]);

  // Status distribution
  const statusStats = useMemo(() => {
    if (!appointments) return [];
    const countMap = new Map<string, number>();
    for (const a of appointments) {
      countMap.set(a.status, (countMap.get(a.status) ?? 0) + 1);
    }
    return Array.from(countMap.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [appointments]);

  // Daily appointment counts
  const dailyStats = useMemo(() => {
    if (!appointments) return [];
    const countMap = new Map<string, number>();
    for (const a of appointments) {
      countMap.set(a.date, (countMap.get(a.date) ?? 0) + 1);
    }
    return Array.from(countMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [appointments]);

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

  // Build mini-chart data for each KPI from daily stats
  const dailyChartPoints = useMemo(() => {
    // Group into ~7 buckets for compact charts
    if (!dailyStats.length) return Array.from({ length: 7 }, (_, i) => ({ index: i, count: 0 }));
    const bucketSize = Math.max(1, Math.ceil(dailyStats.length / 7));
    const buckets: { index: number; count: number }[] = [];
    for (let i = 0; i < dailyStats.length; i += bucketSize) {
      const slice = dailyStats.slice(i, i + bucketSize);
      buckets.push({
        index: buckets.length,
        count: slice.reduce((s, d) => s + d.count, 0),
      });
    }
    return buckets;
  }, [dailyStats]);

  // Completed by day
  const completedChartPoints = useMemo(() => {
    if (!appointments) return Array.from({ length: 7 }, (_, i) => ({ index: i, count: 0 }));
    const countMap = new Map<string, number>();
    for (const a of appointments) {
      if (a.status === "completed") {
        countMap.set(a.date, (countMap.get(a.date) ?? 0) + 1);
      }
    }
    const sorted = Array.from(countMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    if (!sorted.length) return Array.from({ length: 7 }, (_, i) => ({ index: i, count: 0 }));
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
  }, [appointments]);

  // Cancelled by day
  const cancelledChartPoints = useMemo(() => {
    if (!appointments) return Array.from({ length: 7 }, (_, i) => ({ index: i, count: 0 }));
    const countMap = new Map<string, number>();
    for (const a of appointments) {
      if (a.status === "cancelled") {
        countMap.set(a.date, (countMap.get(a.date) ?? 0) + 1);
      }
    }
    const sorted = Array.from(countMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    if (!sorted.length) return Array.from({ length: 7 }, (_, i) => ({ index: i, count: 0 }));
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
  }, [appointments]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t("gabinet.reports.title")}
        description={t("gabinet.reports.description")}
      />

      {/* KPI Statistics Cards (statistics-order-card / statistics-sales-growth-card pattern) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiStatCard
          title={t("gabinet.reports.totalAppointments")}
          description={t("gabinet.reports.last30days")}
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
          description={t("gabinet.reports.last30days")}
          value={cancelledCount.toLocaleString()}
          chartData={cancelledChartPoints}
          chartType="bar"
        />
        <KpiStatCard
          title={t("gabinet.reports.totalPatients")}
          description={t("gabinet.reports.last30days")}
          value={totalPatients.toLocaleString()}
          chartData={dailyChartPoints}
          chartType="area"
        />
      </div>

      {/* Treatment Popularity + Status Distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TreatmentPopularityChart data={treatmentStats} />
        <StatusDistributionChart
          data={statusStats}
          total={totalAppointments}
        />
      </div>

      {/* Daily Appointment Volume */}
      <DailyVolumeChart data={dailyStats} />
    </div>
  );
}
