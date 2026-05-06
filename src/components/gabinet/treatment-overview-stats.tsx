import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  TrendingUp,
  Calendar,
  DollarSign,
  Users,
  Package,
  XCircle,
  UserX,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Bar, BarChart, XAxis, Pie, PieChart, Label } from "recharts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useTranslation } from "react-i18next";
import type { TreatmentDetailedStats } from "@cvx/gabinet/treatments";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentAppointment {
  _id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  patientName: string;
  employeeName: string;
}

interface TreatmentOverviewStatsProps {
  stats: TreatmentDetailedStats;
  recentAppointments: RecentAppointment[];
  currency?: string;
  treatmentName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number, currency?: string): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: currency ?? "PLN",
  }).format(amount);
}

function formatMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  const d = new Date(Number(year), Number(month) - 1);
  return d.toLocaleDateString("pl-PL", { month: "short" });
}

function formatDate(date: string): string {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Status colors for donut chart
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  completed: "var(--primary)",
  confirmed: "color-mix(in oklab, var(--primary) 70%, transparent)",
  scheduled: "color-mix(in oklab, var(--primary) 45%, transparent)",
  in_progress: "color-mix(in oklab, var(--primary) 85%, transparent)",
  pending_confirmation: "color-mix(in oklab, var(--primary) 30%, transparent)",
  cancelled: "var(--destructive)",
  no_show: "color-mix(in oklab, var(--destructive) 60%, transparent)",
};

const STATUS_ORDER = [
  "completed",
  "in_progress",
  "confirmed",
  "scheduled",
  "pending_confirmation",
  "cancelled",
  "no_show",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TreatmentOverviewStats({
  stats,
  recentAppointments,
  currency,
  treatmentName: _treatmentName,
}: TreatmentOverviewStatsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // --- Chart data ---

  const monthlyChartData = useMemo(
    () =>
      stats.monthlyTrend.map((m) => ({
        month: formatMonthLabel(m.month),
        appointments: m.appointments,
        revenue: m.revenue,
      })),
    [stats.monthlyTrend],
  );

  const monthlyChartConfig = {
    appointments: {
      label: t("gabinet.treatmentDetail.overview.appointments", "Wizyty"),
      color: "var(--primary)",
    },
    revenue: {
      label: t("gabinet.treatmentDetail.overview.revenueLabel", "Przychód"),
      color: "color-mix(in oklab, var(--primary) 40%, transparent)",
    },
  } satisfies ChartConfig;

  const statusChartData = useMemo(() => {
    return STATUS_ORDER
      .filter((s) => (stats.statusCounts[s] ?? 0) > 0)
      .map((status) => ({
        status,
        count: stats.statusCounts[status],
        fill: STATUS_COLORS[status] ?? "var(--muted)",
      }));
  }, [stats.statusCounts]);

  const statusChartConfig = useMemo(() => {
    const cfg: ChartConfig = { count: { label: t("gabinet.treatmentDetail.overview.count", "Ilość") } };
    for (const s of STATUS_ORDER) {
      cfg[s] = {
        label: t(`gabinet.appointments.statuses.${s}`, s),
        color: STATUS_COLORS[s] ?? "var(--muted)",
      };
    }
    return cfg;
  }, [t]);

  // --- Metric cards data ---

  const metrics = [
    {
      icon: <Calendar className="size-5" />,
      title: t("gabinet.treatmentDetail.totalAppointments"),
      value: String(stats.total),
    },
    {
      icon: <TrendingUp className="size-5" />,
      title: t("gabinet.treatmentDetail.thisMonth"),
      value: String(stats.thisMonth),
    },
    {
      icon: <DollarSign className="size-5" />,
      title: t("gabinet.treatmentDetail.revenue"),
      value: formatCurrency(stats.revenue, currency),
    },
    {
      icon: <Users className="size-5" />,
      title: t("gabinet.treatmentDetail.overview.uniquePatients", "Unikalni pacjenci"),
      value: String(stats.uniquePatients),
    },
  ];

  // --- Status badge helper ---

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "default" as const;
      case "cancelled":
      case "no_show":
        return "destructive" as const;
      case "confirmed":
        return "secondary" as const;
      default:
        return "outline" as const;
    }
  };

  // Completion progress for bar chart visual (like sales plan %)
  const totalBars = 24;
  const filledBars = Math.round((stats.completionRate * totalBars) / 100);

  const completionBarData = Array.from({ length: totalBars }, (_, i) => ({
    idx: i,
    val: i < filledBars ? 1 : 0,
  }));

  const completionBarConfig = {
    val: { label: t("gabinet.treatmentDetail.overview.completionRate", "Wskaźnik realizacji") },
  } satisfies ChartConfig;

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardContent className="space-y-4 px-0">
        {/* Row 1: Metrics + Status donut */}
        <div className="grid gap-4 lg:grid-cols-5">
          {/* Left: Treatment name + metric cards */}
          <div className="flex flex-col gap-5 lg:col-span-3">
            <span className="text-lg font-semibold">
              {t("gabinet.treatmentDetail.overview.metricsTitle", "Statystyki zabiegu")}
            </span>

            {/* Next/Last appointment quick info */}
            <div className="flex flex-wrap gap-4">
              {stats.lastAppointment && (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Clock className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {t("gabinet.treatmentDetail.overview.lastAppointment", "Ostatnia")}:
                  </span>
                  <span className="font-medium">{formatDate(stats.lastAppointment.date)}</span>
                  <span className="text-muted-foreground">{stats.lastAppointment.patientName}</span>
                </div>
              )}
              {stats.nextAppointment && (
                <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                  <ArrowRight className="size-4 text-primary" />
                  <span className="text-muted-foreground">
                    {t("gabinet.treatmentDetail.overview.nextAppointment", "Następna")}:
                  </span>
                  <span className="font-medium">{formatDate(stats.nextAppointment.date)}</span>
                  <span className="text-muted-foreground">{stats.nextAppointment.patientName}</span>
                </div>
              )}
            </div>

            {/* 2x2 metric cards */}
            <div className="grid gap-3 sm:grid-cols-2">
              {metrics.map((metric, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-md border px-4 py-2.5"
                >
                  <Avatar className="size-8.5 rounded-sm">
                    <AvatarFallback className="bg-primary/10 text-primary shrink-0 rounded-sm">
                      {metric.icon}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground text-sm font-medium">
                      {metric.title}
                    </span>
                    <span className="text-lg font-medium">{metric.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Status donut */}
          <Card className="gap-4 py-4 shadow-none lg:col-span-2">
            <CardHeader className="gap-1">
              <CardTitle className="text-lg font-semibold">
                {t("gabinet.treatmentDetail.overview.statusDistribution", "Rozkład statusów")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {statusChartData.length > 0 ? (
                <ChartContainer config={statusChartConfig} className="h-38.5 w-full">
                  <PieChart margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
                    <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                    <Pie
                      data={statusChartData}
                      dataKey="count"
                      nameKey="status"
                      startAngle={300}
                      endAngle={660}
                      innerRadius={58}
                      outerRadius={75}
                      paddingAngle={2}
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
                                  y={(viewBox.cy || 0) - 12}
                                  className="fill-card-foreground text-lg font-medium"
                                >
                                  {stats.total}
                                </tspan>
                                <tspan
                                  x={viewBox.cx}
                                  y={(viewBox.cy || 0) + 19}
                                  className="fill-muted-foreground text-sm"
                                >
                                  {t("gabinet.treatmentDetail.totalAppointments")}
                                </tspan>
                              </text>
                            );
                          }
                        }}
                      />
                    </Pie>
                  </PieChart>
                </ChartContainer>
              ) : (
                <div className="flex items-center justify-center h-38.5 text-sm text-muted-foreground">
                  {t("gabinet.treatmentDetail.noAppointments")}
                </div>
              )}
            </CardContent>
            <CardFooter />
          </Card>
        </div>

        {/* Row 2: Completion bar + monthly trend */}
        <Card className="shadow-none">
          <CardContent className="grid gap-6 px-4 lg:grid-cols-3">
            {/* Left: Completion rate gauge */}
            <div className="flex flex-col items-center justify-center gap-3">
              <ChartContainer
                config={{
                  completed: { label: t("gabinet.treatmentDetail.overview.completionRate", "Realizacja"), color: "var(--primary)" },
                  remaining: { label: "", color: "var(--muted)" },
                }}
                className="aspect-square w-full max-w-[200px]"
              >
                <PieChart>
                  <Pie
                    data={[
                      { name: "completed", value: stats.completionRate || 0.01, fill: "var(--primary)" },
                      { name: "remaining", value: 100 - (stats.completionRate || 0.01), fill: "var(--muted)" },
                    ]}
                    dataKey="value"
                    innerRadius="70%"
                    outerRadius="90%"
                    startAngle={90}
                    endAngle={-270}
                    strokeWidth={0}
                  >
                    <Label
                      content={({ viewBox }) => {
                        if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                          return (
                            <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                              <tspan x={viewBox.cx} y={(viewBox.cy || 0) - 6} className="fill-foreground text-3xl font-bold">
                                {stats.completionRate}%
                              </tspan>
                              <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 16} className="fill-muted-foreground text-[11px]">
                                {t("gabinet.treatmentDetail.overview.completionRate", "Realizacja")}
                              </tspan>
                            </text>
                          );
                        }
                      }}
                    />
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="flex w-full max-w-[200px] flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <XCircle className="size-3.5" />
                    {t("gabinet.treatmentDetail.overview.cancellationRate", "Odwołania")}
                  </span>
                  <span className="font-medium">{stats.cancellationRate}%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <UserX className="size-3.5" />
                    {t("gabinet.treatmentDetail.overview.noShowRate", "Nieobecności")}
                  </span>
                  <span className="font-medium">{stats.noShowRate}%</span>
                </div>
              </div>
            </div>

            {/* Right: Monthly bar chart */}
            <div className="flex flex-col gap-4 lg:col-span-2">
              <span className="font-medium text-lg">
                {t("gabinet.treatmentDetail.overview.monthlyTrend", "Trend miesięczny")}
              </span>
              <span className="text-muted-foreground text-sm">
                {t(
                  "gabinet.treatmentDetail.overview.monthlyTrendDesc",
                  "Liczba wizyt i przychód z ostatnich 12 miesięcy",
                )}
              </span>

              <ChartContainer config={monthlyChartConfig} className="h-48 w-full">
                <BarChart
                  accessibilityLayer
                  data={monthlyChartData}
                  margin={{ left: 0, right: 0, top: 8, bottom: 0 }}
                  barSize={14}
                >
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="appointments"
                    fill="var(--color-appointments)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>

              {/* Completion mini-bar (like sales plan visual) */}
              <ChartContainer config={completionBarConfig} className="h-7.75 w-full">
                <BarChart
                  accessibilityLayer
                  data={completionBarData}
                  margin={{ left: 0, right: 0 }}
                  maxBarSize={16}
                >
                  <Bar
                    dataKey="val"
                    fill="var(--primary)"
                    background={{
                      fill: "color-mix(in oklab, var(--primary) 10%, transparent)",
                      radius: 12,
                    }}
                    radius={12}
                  />
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>

        {/* Row 3: Employee ranking + Package stats */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Top performers */}
          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {t("gabinet.treatmentDetail.overview.topPerformers", "Najlepsi pracownicy")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.employeeRanking.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {t("gabinet.treatmentDetail.noAppointments")}
                </p>
              ) : (
                <div className="space-y-3">
                  {stats.employeeRanking.map((emp, idx) => (
                    <div
                      key={emp.userId}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-muted-foreground w-4 text-right tabular-nums">
                          {idx + 1}
                        </span>
                        <Avatar className="size-8">
                          {emp.image && <AvatarImage src={emp.image} />}
                          <AvatarFallback className="text-xs">
                            {emp.name
                              .split(" ")
                              .map((w) => w[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{emp.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {emp.completedAppointments} {t("gabinet.treatmentDetail.overview.completed", "wykonanych")}
                          </span>
                        </div>
                      </div>
                      <span className="text-sm font-medium tabular-nums">
                        {formatCurrency(emp.revenue, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Package stats */}
          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Package className="size-4" />
                {t("gabinet.treatmentDetail.overview.packages", "Pakiety")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.packageStats.totalPackages === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {t("gabinet.treatmentDetail.overview.noPackages", "Ten zabieg nie jest częścią żadnego pakietu")}
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md border px-3 py-2.5 text-center">
                      <p className="text-2xl font-bold">{stats.packageStats.activePackages}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("gabinet.treatmentDetail.overview.activePackages", "Aktywnych pakietów")}
                      </p>
                    </div>
                    <div className="rounded-md border px-3 py-2.5 text-center">
                      <p className="text-2xl font-bold">{stats.packageStats.totalPackages}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("gabinet.treatmentDetail.overview.totalPackagesLabel", "Łącznie pakietów")}
                      </p>
                    </div>
                  </div>

                  {stats.packageStats.totalSlots > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {t("gabinet.treatmentDetail.overview.usedSlots", "Wykorzystane zabiegi")}
                        </span>
                        <span className="font-medium tabular-nums">
                          {stats.packageStats.usedSlots} / {stats.packageStats.totalSlots}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{
                            width: `${Math.min(100, (stats.packageStats.usedSlots / stats.packageStats.totalSlots) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {stats.packageStats.remainingSlots}{" "}
                        {t("gabinet.treatmentDetail.overview.remainingSlots", "pozostało do wykorzystania")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Row 4: Recent appointments */}
        <Card className="shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              {t("gabinet.treatmentDetail.recentAppointments")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {t("gabinet.treatmentDetail.noAppointments")}
              </p>
            ) : (
              <div className="space-y-2">
                {recentAppointments.map((apt) => (
                  <div
                    key={apt._id}
                    className="flex items-center justify-between rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() =>
                      navigate({
                        to: "/dashboard/gabinet/appointments/$appointmentId",
                        params: { appointmentId: apt._id },
                      })
                    }
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-sm">
                        <span className="font-medium">{apt.date}</span>
                        <span className="text-muted-foreground ml-2">
                          {apt.startTime}–{apt.endTime}
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {apt.patientName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {apt.employeeName}
                      </span>
                      <Badge variant={statusBadgeVariant(apt.status)}>
                        {t(`gabinet.appointments.statuses.${apt.status}`)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}
