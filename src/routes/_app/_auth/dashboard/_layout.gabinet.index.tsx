import { createFileRoute, Link } from "@tanstack/react-router";
import { PermissionGate } from "@/hooks/use-permission";
import { useOrganization } from "@/components/org-context";
import { useSupabaseGabinetAppointmentsByDateRange, useSupabaseGabinetAppointmentPaymentTotals, useSupabaseGabinetAppointmentPackagePositions } from "@/hooks/use-supabase-gabinet-appointments";
import { useSupabaseGabinetPatientsList } from "@/hooks/use-supabase-gabinet-patients";
import { useSupabaseGabinetTreatmentsList } from "@/hooks/use-supabase-gabinet-treatments";
import { useSupabaseGabinetLeavesList } from "@/hooks/use-supabase-gabinet-leaves";
import { useSupabaseGabinetEmployeesList } from "@/hooks/use-supabase-gabinet-employees";
import { useSupabaseGabinetPackageUsageActive, useSupabaseGabinetTreatmentPackagesList } from "@/hooks/use-supabase-gabinet-packages";
import {
  useSupabaseGabinetWeeklyAppointments,
  useSupabaseGabinetMonthlyNewPatients,
  useSupabaseGabinetWeeklyCompletedTreatments,
  useSupabaseGabinetMonthlyAppointments,
  useSupabaseGabinetAppointmentStatusDistribution,
  useSupabaseGabinetTopTreatments,
  useSupabaseGabinetWeeklyRevenue,
} from "@/hooks/use-supabase-gabinet-dashboard";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { appointmentStatusBadgeClass } from "@/lib/gabinet-appointment-status";
import { formatCurrencyPLN } from "@/lib/format-currency";

import {
  CalendarCheck,
  Users,
  Stethoscope,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  CreditCard,
  Package,
  UserPlus,
  Plus,
} from "@/lib/ez-icons";

// shadcn/studio statistics blocks
import StatisticsOrderCard from "@/components/shadcn-studio/blocks/statistics-order-card";
import StatisticsProfitCard from "@/components/shadcn-studio/blocks/statistics-profit-card";
import StatisticsImpressionCard from "@/components/shadcn-studio/blocks/statistics-impression-card";
import StatisticsSalesGrowthCard from "@/components/shadcn-studio/blocks/statistics-sales-growth-card";

// shadcn/studio chart blocks
import TotalIncomeCard from "@/components/shadcn-studio/blocks/chart-total-income";
import EarningReportCard from "@/components/shadcn-studio/blocks/chart-earning-report";
import TotalOrdersCard from "@/components/shadcn-studio/blocks/chart-total-orders";

function GabinetDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/"
)({
  component: () => (
    <PermissionGate
      feature="gabinet_dashboard"
      action="view"
      loadingFallback={<GabinetDashboardSkeleton />}
    >
      <GabinetDashboard />
    </PermissionGate>
  ),
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
  const todayScheduleRef = useRef<HTMLDivElement | null>(null);

  useSidebarDispatch("viewTodaySchedule", () => {
    todayScheduleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // --- Data queries (Supabase-backed) ---
  const { data: todayAppointments } = useSupabaseGabinetAppointmentsByDateRange(
    organizationId, today, today,
  );

  const { data: patientsData } = useSupabaseGabinetPatientsList(organizationId);
  const { data: treatmentsData } = useSupabaseGabinetTreatmentsList(organizationId);
  const { data: leavesData } = useSupabaseGabinetLeavesList(organizationId);
  const { data: employeesData } = useSupabaseGabinetEmployeesList(organizationId, { activeOnly: true });
  const { data: activePackageUsages } = useSupabaseGabinetPackageUsageActive(organizationId);
  const { data: packagesList } = useSupabaseGabinetTreatmentPackagesList(organizationId);

  const treatments = useMemo(
    () => (treatmentsData ?? []).filter((tr) => tr.isActive),
    [treatmentsData],
  );

  // --- Sparkline data (Supabase-backed) ---
  const { data: weeklyAppointments } = useSupabaseGabinetWeeklyAppointments(organizationId);
  const { data: monthlyPatients } = useSupabaseGabinetMonthlyNewPatients(organizationId);
  const { data: weeklyCompleted } = useSupabaseGabinetWeeklyCompletedTreatments(organizationId);
  const { data: weeklyRevenue } = useSupabaseGabinetWeeklyRevenue(organizationId);

  // --- Chart block data (Supabase-backed) ---
  const { data: monthlyAppointments } = useSupabaseGabinetMonthlyAppointments(organizationId);
  const { data: statusDistribution } = useSupabaseGabinetAppointmentStatusDistribution(organizationId);
  const { data: topTreatments } = useSupabaseGabinetTopTreatments(organizationId);

  // --- Derived maps ---
  const patientMap = useMemo(
    () => new Map((patientsData ?? []).map((p) => [p._id, `${p.firstName} ${p.lastName}`])),
    [patientsData],
  );

  const treatmentMap = useMemo(
    () => new Map((treatments ?? []).map((tr) => [tr._id, tr.name])),
    [treatments],
  );

  const employeeMap = useMemo(
    () => new Map(
      (employeesData ?? []).map((e) => [e._id, [e.firstName, e.lastName].filter(Boolean).join(" ")])
    ),
    [employeesData],
  );

  const packageNameMap = useMemo(
    () => new Map((packagesList ?? []).map((p) => [p._id, p.name])),
    [packagesList],
  );

  const enrichedAppointments = useMemo(() => {
    return (todayAppointments ?? []).map((a) => ({
      ...a,
      patientName: patientMap.get(a.patientId) ?? t("common.unknown"),
      treatmentName: a.treatmentId ? (treatmentMap.get(a.treatmentId) ?? t("common.unknown")) : t("common.unknown"),
      employeeName: employeeMap.get(a.employeeId) ?? undefined,
    }));
  }, [todayAppointments, patientMap, treatmentMap, employeeMap, t]);

  // --- Package positions for today's appointments ---
  const packageUsageIdsFromToday = useMemo(
    () => (todayAppointments ?? []).flatMap((a) => (a.packageUsageId ? [a.packageUsageId] : [])),
    [todayAppointments],
  );

  const { data: packagePositions } = useSupabaseGabinetAppointmentPackagePositions(
    organizationId,
    packageUsageIdsFromToday,
    { enabled: packageUsageIdsFromToday.length > 0 },
  );

  // --- Payment totals for today's appointments (to-settle) ---
  const todayApptIds = useMemo(
    () => (todayAppointments ?? []).map((a) => a._id),
    [todayAppointments],
  );

  const { data: paymentTotals } = useSupabaseGabinetAppointmentPaymentTotals(
    organizationId,
    todayApptIds,
    { enabled: todayApptIds.length > 0 },
  );

  // Appointments needing settlement: not cancelled/no_show, have a price, paid less than price
  const toSettleAppointments = useMemo(() => {
    if (!paymentTotals && todayApptIds.length > 0) return [];
    return enrichedAppointments.filter((a) => {
      if (a.status === "cancelled" || a.status === "no_show") return false;
      const price = a.priceAtBooking ?? 0;
      if (price <= 0) return false;
      const paid = paymentTotals?.get(a._id) ?? 0;
      return paid < price;
    });
  }, [enrichedAppointments, paymentTotals, todayApptIds.length]);

  // Active package usages enriched with patient/package info
  const enrichedActivePackages = useMemo(() => {
    return (activePackageUsages ?? [])
      .slice(0, 6)
      .map((u) => {
        const totalUsed = u.treatmentsUsed.reduce((s, e) => s + e.usedCount, 0);
        const totalAllowed = u.treatmentsUsed.reduce((s, e) => s + e.totalCount, 0);
        return {
          ...u,
          patientName: patientMap.get(u.patientId ?? "") ?? t("common.unknown"),
          packageName: packageNameMap.get(u.packageId) ?? t("gabinet.dashboard.package", "Pakiet"),
          totalUsed,
          totalAllowed,
        };
      });
  }, [activePackageUsages, patientMap, packageNameMap, t]);

  const pendingLeaves = (leavesData ?? []).filter((l) => l.status === "pending");
  const totalPatients = patientsData?.length ?? 0;
  const todayCount = enrichedAppointments.length;
  const completedTodayCount = enrichedAppointments.filter((a) => a.status === "completed").length;

  const todayRevenue = useMemo(
    () =>
      enrichedAppointments
        .filter((a) => a.status !== "cancelled" && a.status !== "no_show")
        .reduce((sum, a) => sum + (a.priceAtBooking ?? 0), 0),
    [enrichedAppointments],
  );

  const weeklyRevenueTotal = useMemo(
    () => (weeklyRevenue ?? []).reduce((sum, d) => sum + d.revenue, 0),
    [weeklyRevenue],
  );

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

  const revenueChartData = (weeklyRevenue ?? []).map((d) => ({
    month: d.day,
    impression: d.revenue,
  }));

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
    <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
      <PageHeader
        title={t("gabinet.dashboard.title")}
        description={t("gabinet.dashboard.description")}
      />

      {/* Quick actions — shown first on mobile via DOM order; restored to position 5 on md+ */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 md:order-5">
        <Link
          to="/dashboard/gabinet/calendar"
          className="flex items-center gap-2 rounded-lg border p-3 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          <Calendar className="size-4 shrink-0 text-muted-foreground" />
          {t("gabinet.dashboard.goToCalendar")}
        </Link>
        <Button asChild variant="outline" className="justify-start gap-2 h-auto py-3 px-3">
          <Link to="/dashboard/gabinet/calendar" search={{ action: "create-appointment" }}>
            <Plus className="size-4 shrink-0 text-muted-foreground" />
            {t("gabinet.dashboard.addAppointment", "Umów wizytę")}
          </Link>
        </Button>
        <Button asChild variant="outline" className="justify-start gap-2 h-auto py-3 px-3">
          <Link to="/dashboard/gabinet/patients">
            <UserPlus className="size-4 shrink-0 text-muted-foreground" />
            {t("gabinet.dashboard.addPatient", "Dodaj klienta")}
          </Link>
        </Button>
        <Link
          to="/dashboard/gabinet/packages"
          className="flex items-center gap-2 rounded-lg border p-3 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          <Package className="size-4 shrink-0 text-muted-foreground" />
          {t("gabinet.dashboard.goToPackages")}
        </Link>
        <Link
          to="/dashboard/gabinet/patients"
          className="flex items-center gap-2 rounded-lg border p-3 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          <CreditCard className="size-4 shrink-0 text-muted-foreground" />
          {t("gabinet.dashboard.goToPatients")}
        </Link>
      </div>

      {/* 1. KPI tiles — always visible, 2-column on mobile */}
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4 md:order-2">
        <Link to="/dashboard/gabinet/calendar" className="block">
          <StatisticsOrderCard
            title={t("gabinet.dashboard.todayAppointments")}
            description={t("gabinet.dashboard.thisWeek", "Ten tydzień")}
            value={String(todayCount)}
            changePercentage={t("gabinet.dashboard.today", "Dziś")}
            chartData={appointmentChartData.length > 0 ? appointmentChartData : undefined}
          />
        </Link>
        <Link to="/dashboard/gabinet/calendar" className="block">
          <StatisticsProfitCard
            title={t("gabinet.dashboard.completedTreatments", "Wykonane zabiegi")}
            description={t("gabinet.dashboard.today", "Dziś")}
            value={String(completedTodayCount)}
            changePercentage={
              weeklyCompleted
                ? `${weeklyCompleted.reduce((s, d) => s + d.completed, 0)} ${t("gabinet.dashboard.thisWeekShort", "w tym tyg.")}`
                : ""
            }
            chartData={completedChartData.length > 0 ? completedChartData : undefined}
          />
        </Link>
        <Link to="/dashboard/gabinet/patients" className="block">
          <StatisticsSalesGrowthCard
            title={t("gabinet.dashboard.totalPatients")}
            description={t("gabinet.dashboard.allTime", "Ogółem")}
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
        <Link to="/dashboard/gabinet/reports" className="block">
          <StatisticsImpressionCard
            title={t("gabinet.dashboard.dailyRevenue", "Przychód dziś")}
            description={t("gabinet.dashboard.fromAppointments", "z wizyt")}
            value={formatCurrencyPLN(todayRevenue, "zł")}
            changePercentage={
              weeklyRevenue
                ? `${formatCurrencyPLN(weeklyRevenueTotal, "zł")} ${t("gabinet.dashboard.thisWeekShort", "w tym tyg.")}`
                : ""
            }
            chartData={revenueChartData.length > 0 ? revenueChartData : undefined}
          />
        </Link>
      </div>

      {/* 2. Today's schedule — high priority, full-width */}
      <div ref={todayScheduleRef} className="scroll-mt-6 md:order-3">
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{t("gabinet.dashboard.todaySchedule")}</span>
              <span className="text-muted-foreground text-xs">
                {todayCount} {t("gabinet.dashboard.appointmentsPlanned", "zaplanowanych")} · {completedTodayCount} {t("gabinet.dashboard.done", "wykonanych")}
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
                {enrichedAppointments.map((a) => {
                  const pkgPos = a.packageUsageId ? packagePositions?.get(a._id) : undefined;
                  return (
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
                          {a.employeeName ? ` · ${a.employeeName}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {pkgPos && (
                          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                            {pkgPos.position}/{pkgPos.total}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={appointmentStatusBadgeClass(a.status)}
                        >
                          {t(`gabinet.appointments.statuses.${a.status}`)}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 3. To-settle + Active packages — side by side on md+ */}
      <div className="grid gap-4 md:grid-cols-2 md:order-4">
        {/* To Settle */}
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{t("gabinet.dashboard.toSettle", "Do rozliczenia")}</span>
              <span className="text-muted-foreground text-xs">
                {t("gabinet.dashboard.todayUnpaid", "Dzisiejsze nieopłacone")}
              </span>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {todayApptIds.length > 0 && !paymentTotals ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : toSettleAppointments.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {t("gabinet.dashboard.noUnsettled", "Brak wizyt do rozliczenia")}
              </div>
            ) : (
              <div className="divide-y">
                {toSettleAppointments.map((a) => {
                  const paid = paymentTotals?.get(a._id) ?? 0;
                  const price = a.priceAtBooking ?? 0;
                  const remaining = price - paid;
                  return (
                    <div key={a._id} className="flex items-center gap-3 px-4 py-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="text-[10px] font-medium">
                          {a.patientName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.patientName}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {a.startTime} · {a.treatmentName}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-destructive">
                          {formatCurrencyPLN(remaining, "zł")}
                        </p>
                        {paid > 0 && (
                          <p className="text-muted-foreground text-xs">
                            {t("gabinet.dashboard.paidPartial", "zapł.")} {formatCurrencyPLN(paid, "zł")}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Packages */}
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{t("gabinet.dashboard.activePackages", "Aktywne pakiety")}</span>
              <span className="text-muted-foreground text-xs">
                {activePackageUsages?.length ?? 0} {t("gabinet.dashboard.activeShort", "aktywnych")}
              </span>
            </div>
            <Link
              to="/dashboard/gabinet/packages"
              className="text-primary text-xs font-medium hover:underline"
            >
              {t("gabinet.dashboard.viewAll", "Zobacz wszystkie")}
            </Link>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {enrichedActivePackages.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {t("gabinet.dashboard.noActivePackages", "Brak aktywnych pakietów")}
              </div>
            ) : (
              <div className="divide-y">
                {enrichedActivePackages.map((u) => (
                  <div key={u._id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-chart-1/10 text-chart-1 text-[10px] font-medium">
                        {u.patientName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{u.patientName}</p>
                      <p className="text-muted-foreground truncate text-xs">{u.packageName}</p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {u.totalUsed}/{u.totalAllowed}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 5. Monthly Overview – TotalIncomeCard */}
      <TotalIncomeCard
        className="md:order-6"
        title={t("gabinet.dashboard.monthlyOverview", "Przegląd miesięczny")}
        subtitle={t("gabinet.dashboard.last6MonthsOverview", "Ostatnie 6 miesięcy")}
        reportTitle={t("gabinet.dashboard.summary", "Podsumowanie")}
        reportSubtitle={t("gabinet.dashboard.keyMetrics", "Kluczowe metryki")}
        chartData={monthlyChartData.length >= 3 ? monthlyChartData : undefined}
        reportData={monthlyReportData}
        blurred={monthlyChartData.length < 3}
      />

      {/* 6. Weekly Appointments + Status Distribution */}
      <div className="grid gap-6 md:grid-cols-2 md:order-7">
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

      {/* 7. Pending leaves — moved to bottom */}
      <Card className="gap-0 py-0 md:order-8">
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
    </div>
  );
}
