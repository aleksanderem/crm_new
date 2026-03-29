import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import {
  CalendarCheck,
  Users,
  Stethoscope,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "@/lib/ez-icons";
import {
  CircleAlert as CircleAlertIcon,
  TriangleAlert as TriangleAlertIcon,
  CircleCheck as CircleCheckIcon,
} from "lucide-react";

// shadcn/studio statistics blocks
import StatisticsOrderCard from "@/components/shadcn-studio/blocks/statistics-order-card";
import StatisticsProfitCard from "@/components/shadcn-studio/blocks/statistics-profit-card";
import StatisticsImpressionCard from "@/components/shadcn-studio/blocks/statistics-impression-card";
import StatisticsSalesGrowthCard from "@/components/shadcn-studio/blocks/statistics-sales-growth-card";

// shadcn/studio chart blocks
import TotalIncomeCard from "@/components/shadcn-studio/blocks/chart-total-income";
import EarningReportCard from "@/components/shadcn-studio/blocks/chart-earning-report";
import TotalOrdersCard from "@/components/shadcn-studio/blocks/chart-total-orders";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/"
)({
  component: GabinetDashboard,
});

const statusColors: Record<string, string> = {
  completed: "var(--chart-2)",
  confirmed: "var(--chart-1)",
  scheduled: "var(--chart-3)",
  in_progress: "var(--chart-4)",
  cancelled: "var(--chart-5)",
  no_show: "var(--chart-5)",
};

const statusLabels: Record<string, string> = {
  completed: "Wykonane",
  confirmed: "Potwierdzone",
  scheduled: "Zaplanowane",
  in_progress: "W trakcie",
  cancelled: "Anulowane",
  no_show: "Nieobecność",
};

function GabinetDashboard() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const today = new Date().toISOString().split("T")[0];

  // --- Data queries ---
  const { data: todayAppointments } = useQuery(
    convexQuery(api.gabinet.appointments.listByDate, {
      organizationId,
      date: today,
    })
  );

  const { data: patients } = useQuery(
    convexQuery(api.gabinet.patients.list, {
      organizationId,
      paginationOpts: { numItems: 200, cursor: null },
    })
  );

  const { data: treatments } = useQuery(
    convexQuery(api.gabinet.treatments.listActive, { organizationId })
  );

  const { data: leaves } = useQuery(
    convexQuery(api.gabinet.scheduling.listLeaves, { organizationId })
  );

  // --- Nudges ---
  const { data: appointmentNudges } = useQuery(
    convexQuery(api.gabinet.nudges.getAppointmentNudges, { organizationId })
  );
  const { data: leaveNudges } = useQuery(
    convexQuery(api.gabinet.nudges.getLeaveNudges, { organizationId })
  );
  const { data: patientNudges } = useQuery(
    convexQuery(api.gabinet.nudges.getPatientNudges, { organizationId })
  );

  const allNudges = useMemo(() => [
    ...(appointmentNudges ?? []),
    ...(leaveNudges ?? []),
    ...(patientNudges ?? []),
  ], [appointmentNudges, leaveNudges, patientNudges]);

  // --- Sparkline data ---
  const { data: weeklyAppointments } = useQuery(
    convexQuery(api.gabinet.sidebarWidgets.getWeeklyAppointments, { organizationId })
  );

  const { data: monthlyPatients } = useQuery(
    convexQuery(api.gabinet.sidebarWidgets.getMonthlyNewPatients, { organizationId })
  );

  const { data: weeklyCompleted } = useQuery(
    convexQuery(api.gabinet.sidebarWidgets.getWeeklyCompletedTreatments, { organizationId })
  );

  // --- Chart block data ---
  const { data: monthlyAppointments } = useQuery(
    convexQuery(api.gabinet.sidebarWidgets.getMonthlyAppointments, { organizationId })
  );

  const { data: statusDistribution } = useQuery(
    convexQuery(api.gabinet.sidebarWidgets.getAppointmentStatusDistribution, { organizationId })
  );

  const { data: topTreatments } = useQuery(
    convexQuery(api.gabinet.sidebarWidgets.getTopTreatments, { organizationId })
  );

  // --- Derived data ---
  const patientMap = useMemo(
    () => new Map((patients?.page ?? []).map((p) => [p._id, `${p.firstName} ${p.lastName}`])),
    [patients]
  );

  const treatmentMap = useMemo(
    () => new Map((treatments ?? []).map((tr) => [tr._id, tr.name])),
    [treatments]
  );

  const enrichedAppointments = useMemo(() => {
    return (todayAppointments ?? []).map((a) => ({
      ...a,
      patientName: patientMap.get(a.patientId) ?? t("common.unknown"),
      treatmentName: treatmentMap.get(a.treatmentId as Id<"gabinetTreatments">) ?? t("common.unknown"),
    }));
  }, [todayAppointments, patientMap, treatmentMap, t]);

  const pendingLeaves = (leaves ?? []).filter((l) => l.status === "pending");
  const totalPatients = patients?.page?.length ?? 0;
  const totalTreatments = treatments?.length ?? 0;
  const todayCount = enrichedAppointments.length;

  const statusColor = (s: string) => {
    switch (s) {
      case "scheduled": return "outline" as const;
      case "confirmed": return "default" as const;
      case "in_progress": return "default" as const;
      case "completed": return "secondary" as const;
      case "cancelled": return "destructive" as const;
      default: return "secondary" as const;
    }
  };

  // --- Build sparkline chart data for statistics cards ---
  const appointmentChartData = (weeklyAppointments ?? []).map((d) => ({
    day: d.day,
    orders: d.appointments,
  }));

  const patientChartData = (monthlyPatients ?? []).map((d) => ({
    date: d.month,
    sales: d.patients,
  }));

  const completedChartData = (weeklyCompleted ?? []).map((d) => ({
    month: d.day,
    profit: d.completed,
  }));

  const leaveChartData = useMemo(() => {
    const count = pendingLeaves.length;
    return [
      { month: "1", impression: Math.max(0, count - 2) },
      { month: "2", impression: Math.max(0, count - 1) },
      { month: "3", impression: count },
      { month: "4", impression: Math.max(0, count + 1) },
      { month: "5", impression: count },
      { month: "6", impression: count },
    ];
  }, [pendingLeaves.length]);

  // --- TotalIncomeCard: monthly appointments area chart + summary ---
  const monthlyChartData = (monthlyAppointments ?? []).map((d) => ({
    day: d.month,
    incomes: d.appointments,
  }));

  const totalMonthlyCompleted = (monthlyAppointments ?? []).reduce(
    (s, d) => s + d.completed, 0
  );
  const totalMonthlyAppts = (monthlyAppointments ?? []).reduce(
    (s, d) => s + d.appointments, 0
  );

  const monthlyReportData: { icons: ReactNode; title: string; amount: string; change: string }[] = useMemo(() => [
    {
      icons: <CalendarCheck className="text-chart-2 size-6 stroke-[1.5]" />,
      title: t("gabinet.dashboard.totalAppointments", "Wizyty ogółem"),
      amount: String(totalMonthlyAppts),
      change: `${(monthlyAppointments ?? []).at(-1)?.appointments ?? 0} ${t("gabinet.dashboard.thisMonthShort", "ten mies.")}`,
    },
    {
      icons: <CheckCircle className="text-chart-4 size-6 stroke-[1.5]" />,
      title: t("gabinet.dashboard.completedTotal", "Wykonane"),
      amount: String(totalMonthlyCompleted),
      change: `${(monthlyAppointments ?? []).at(-1)?.completed ?? 0} ${t("gabinet.dashboard.thisMonthShort", "ten mies.")}`,
    },
    {
      icons: <Users className="text-chart-1 size-6 stroke-[1.5]" />,
      title: t("gabinet.dashboard.totalPatients"),
      amount: String(totalPatients),
      change: `+${(monthlyPatients ?? []).at(-1)?.patients ?? 0} ${t("gabinet.dashboard.newShort", "nowych")}`,
    },
  ], [totalMonthlyAppts, totalMonthlyCompleted, totalPatients, monthlyAppointments, monthlyPatients, t]);

  // --- EarningReportCard: weekly appointments bar chart + top treatments ---
  const weeklyBarChartData = (weeklyAppointments ?? []).map((d) => ({
    day: d.day,
    earning: d.appointments,
    fill: "var(--chart-2)",
  }));

  const treatmentStatData = useMemo(() => {
    const top3 = (topTreatments ?? []).slice(0, 3);
    const icons = [
      <Stethoscope className="size-5" key="1" />,
      <CalendarCheck className="size-5" key="2" />,
      <Clock className="size-5" key="3" />,
    ];
    return top3.map((tr, i) => ({
      icon: icons[i],
      title: tr.label,
      department: t("gabinet.dashboard.appointments", "wizyty"),
      value: String(tr.value),
      trend: "up" as const,
      percentage: 0,
    }));
  }, [topTreatments, t]);

  // --- TotalOrdersCard: appointment status donut ---
  const donutChartData = useMemo(() => {
    return (statusDistribution?.statuses ?? []).map((s) => ({
      month: statusLabels[s.status] ?? s.status,
      order: s.count,
      fill: statusColors[s.status] ?? "var(--chart-3)",
    }));
  }, [statusDistribution]);

  const donutChartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {};
    for (const s of statusDistribution?.statuses ?? []) {
      cfg[statusLabels[s.status] ?? s.status] = {
        label: statusLabels[s.status] ?? s.status,
        color: statusColors[s.status] ?? "var(--chart-3)",
      };
    }
    return cfg;
  }, [statusDistribution]);

  const statusIcons: Record<string, ReactNode> = {
    completed: <CheckCircle className="size-6 text-chart-2" />,
    confirmed: <CalendarCheck className="size-6 text-chart-1" />,
    scheduled: <Clock className="size-6 text-chart-3" />,
    in_progress: <Stethoscope className="size-6 text-chart-4" />,
    cancelled: <XCircle className="size-6 text-chart-5" />,
    no_show: <AlertCircle className="size-6 text-chart-5" />,
  };

  const donutListData = useMemo(() => {
    return (statusDistribution?.statuses ?? []).slice(0, 4).map((s) => ({
      icon: statusIcons[s.status] ?? <CalendarCheck className="size-6" />,
      title: statusLabels[s.status] ?? s.status,
      department: t("gabinet.dashboard.thisMonth", "ten mies."),
      value: String(s.count),
    }));
  }, [statusDistribution, t]);

  const completedPct = statusDistribution && statusDistribution.total > 0
    ? Math.round(
      ((statusDistribution.statuses.find((s) => s.status === "completed")?.count ?? 0) /
        statusDistribution.total) * 100
    )
    : 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t("gabinet.dashboard.title")}
        description={t("gabinet.dashboard.description")}
      />

      {/* KPI Statistics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/dashboard/gabinet/calendar" className="block">
          <StatisticsOrderCard
            title={t("gabinet.dashboard.todayAppointments")}
            description={t("gabinet.dashboard.thisWeek", "Ten tydzień")}
            value={String(todayCount)}
            changePercentage={t("gabinet.dashboard.today", "Dziś")}
            chartData={appointmentChartData.length > 0 ? appointmentChartData : undefined}
          />
        </Link>
        <Link to="/dashboard/gabinet/patients" className="block">
          <StatisticsSalesGrowthCard
            title={t("gabinet.dashboard.totalPatients")}
            description={t("gabinet.dashboard.last6Months", "Ostatnie 6 mies.")}
            value={String(totalPatients)}
            changePercentage={
              monthlyPatients && monthlyPatients.length > 0
                ? `+${monthlyPatients[monthlyPatients.length - 1]?.patients ?? 0} ${t("gabinet.dashboard.thisMonth", "ten mies.")}`
                : ""
            }
            chartData={patientChartData.length > 0 ? patientChartData : undefined}
            gradientId="fillPatients"
          />
        </Link>
        <Link to="/dashboard/gabinet/treatments" className="block">
          <StatisticsProfitCard
            title={t("gabinet.dashboard.completedTreatments", "Wykonane zabiegi")}
            description={t("gabinet.dashboard.thisWeek", "Ten tydzień")}
            value={String(totalTreatments)}
            changePercentage={
              weeklyCompleted
                ? `${weeklyCompleted.reduce((s, d) => s + d.completed, 0)} ${t("gabinet.dashboard.thisWeekShort", "w tym tyg.")}`
                : ""
            }
            chartData={completedChartData.length > 0 ? completedChartData : undefined}
          />
        </Link>
        <Link to="/dashboard/gabinet/settings/leaves" className="block">
          <StatisticsImpressionCard
            title={t("gabinet.dashboard.pendingLeaves")}
            description={t("gabinet.dashboard.awaitingApproval", "Oczekujące")}
            value={String(pendingLeaves.length)}
            changePercentage={
              pendingLeaves.length > 0
                ? t("gabinet.dashboard.requiresAttention", "Wymaga uwagi")
                : t("gabinet.dashboard.allClear", "Wszystko ok")
            }
            chartData={leaveChartData}
          />
        </Link>
      </div>

      {/* Monthly Overview – TotalIncomeCard */}
      <TotalIncomeCard
        title={t("gabinet.dashboard.monthlyOverview", "Przegląd miesięczny")}
        subtitle={t("gabinet.dashboard.last6MonthsOverview", "Ostatnie 6 miesięcy")}
        reportTitle={t("gabinet.dashboard.summary", "Podsumowanie")}
        reportSubtitle={t("gabinet.dashboard.keyMetrics", "Kluczowe metryki")}
        chartData={monthlyChartData.length >= 3 ? monthlyChartData : undefined}
        reportData={monthlyReportData}
        blurred={monthlyChartData.length < 3}
      />

      {/* Weekly Appointments + Status Distribution */}
      <div className="grid gap-6 md:grid-cols-2">
        <EarningReportCard
          title={t("gabinet.dashboard.weeklyAppointments", "Wizyty tygodniowe")}
          subTitle={t("gabinet.dashboard.topTreatmentsSubtitle", "Najpopularniejsze zabiegi")}
          statData={treatmentStatData}
          chartData={weeklyBarChartData.length >= 5 ? weeklyBarChartData : undefined}
          blurred={weeklyBarChartData.length < 5}
        />
        <TotalOrdersCard
          title={t("gabinet.dashboard.appointmentStatuses", "Statusy wizyt")}
          subtitle={`${statusDistribution?.total ?? 0} ${t("gabinet.dashboard.thisMonthTotal", "wizyt w tym miesiącu")}`}
          totalValue={String(statusDistribution?.total ?? 0)}
          totalLabel={t("gabinet.dashboard.totalAppointments", "Wizyty ogółem")}
          centerLabel={`${completedPct}%`}
          centerSublabel={t("gabinet.dashboard.completedRate", "Wykonane")}
          chartData={donutChartData.length >= 2 ? donutChartData : undefined}
          chartConfig={donutChartConfig}
          listData={donutListData}
          blurred={donutChartData.length < 2}
        />
      </div>

      {/* Today's schedule + Pending leaves + Nudges */}
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {/* Today's schedule */}
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{t("gabinet.dashboard.todaySchedule")}</span>
              <span className="text-muted-foreground text-xs">
                {todayCount} {t("gabinet.dashboard.appointmentsPlanned", "zaplanowanych")}
              </span>
            </div>
            <Link
              to="/dashboard/gabinet/calendar"
              className="text-primary text-xs font-medium hover:underline"
            >
              {t("gabinet.dashboard.goToCalendar")}
            </Link>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {enrichedAppointments.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {t("gabinet.dashboard.noAppointmentsToday")}
              </div>
            ) : (
              <div className="divide-y">
                {enrichedAppointments.map((a) => (
                  <div key={a._id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-[10px] font-medium">
                        {a.patientName
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.patientName}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {a.startTime}–{a.endTime} · {a.treatmentName}
                      </p>
                    </div>
                    <Badge variant={statusColor(a.status)}>
                      {t(`gabinet.appointments.statuses.${a.status}`)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending leaves */}
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{t("gabinet.dashboard.pendingLeaveRequests")}</span>
              <span className="text-muted-foreground text-xs">
                {pendingLeaves.length} {t("gabinet.dashboard.awaitingApproval", "oczekujące")}
              </span>
            </div>
            <Link
              to="/dashboard/gabinet/settings/leaves"
              className="text-primary text-xs font-medium hover:underline"
            >
              {t("gabinet.dashboard.viewAll", "Zobacz wszystkie")}
            </Link>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {pendingLeaves.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {t("gabinet.dashboard.noPendingLeaves")}
              </div>
            ) : (
              <div className="divide-y">
                {pendingLeaves.map((leave) => (
                  <div key={leave._id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-chart-4/10 text-chart-4 text-[10px] font-medium">
                        {leave.type?.charAt(0).toUpperCase() ?? "L"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium capitalize">{leave.type}</p>
                      <p className="text-muted-foreground text-xs">
                        {leave.startDate} — {leave.endDate}
                      </p>
                    </div>
                    <Badge variant="outline">{t("gabinet.leaves.pending")}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Nudges widget */}
        {allNudges.length > 0 && (
          <Card className="gap-0 py-0">
            <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">{t("gabinet.dashboard.actionItems", "Wymagają uwagi")}</span>
                <span className="text-muted-foreground text-xs">
                  {allNudges.length} {t("gabinet.dashboard.notifications", "powiadomień")}
                </span>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              <div className="divide-y">
                {allNudges.map((nudge, idx) => {
                  const severityConfig = {
                    red: { Icon: CircleAlertIcon, bgClass: "bg-red-500/10", iconClass: "text-red-500" },
                    yellow: { Icon: TriangleAlertIcon, bgClass: "bg-amber-500/10", iconClass: "text-amber-500" },
                    green: { Icon: CircleCheckIcon, bgClass: "bg-emerald-500/10", iconClass: "text-emerald-500" },
                  }[nudge.severity];
                  return (
                    <div key={`${nudge.message}-${idx}`} className="flex items-start gap-3 px-4 py-3">
                      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${severityConfig.bgClass}`}>
                        <severityConfig.Icon className={`h-4 w-4 ${severityConfig.iconClass}`} />
                      </div>
                      <p className="text-sm leading-snug">
                        {t(nudge.message, {
                          defaultValue: nudge.message,
                          ...(nudge.messageValues ?? {}),
                        })}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          to="/dashboard/gabinet/calendar"
          className="rounded-lg border p-4 text-center text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          {t("gabinet.dashboard.goToCalendar")}
        </Link>
        <Link
          to="/dashboard/gabinet/patients"
          className="rounded-lg border p-4 text-center text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          {t("gabinet.dashboard.goToPatients")}
        </Link>
        <Link
          to="/dashboard/gabinet/packages"
          className="rounded-lg border p-4 text-center text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          {t("gabinet.dashboard.goToPackages")}
        </Link>
        <Link
          to="/dashboard/gabinet/documents"
          className="rounded-lg border p-4 text-center text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          {t("gabinet.dashboard.goToDocuments")}
        </Link>
      </div>
    </div>
  );
}
