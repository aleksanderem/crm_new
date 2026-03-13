import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { StaffLoad } from "../staff-load";
import { StaffSchedule } from "../staff-schedule";
import { SmartAgenda } from "../smart-agenda";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const weeklyChartConfig = {
  appointments: {
    label: "Wizyty",
    color: "var(--chart-2)",
  },
  completed: {
    label: "Wykonane",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

export function GabinetDashboardWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const user = useQuery(api.app.getCurrentUser);
  const kpis = useQuery(api.gabinet.sidebarWidgets.getDashboardKpis, { organizationId });
  const staffLoad = useQuery(api.gabinet.sidebarWidgets.getStaffLoad, { organizationId });
  const todaySchedule = useQuery(api.gabinet.sidebarWidgets.getTodaySchedule, { organizationId });
  const weeklyAppointments = useQuery(api.gabinet.sidebarWidgets.getWeeklyAppointments, { organizationId });
  const weeklyCompleted = useQuery(api.gabinet.sidebarWidgets.getWeeklyCompletedTreatments, { organizationId });

  if (!kpis) return null;

  // Build weekly chart data combining appointments + completed
  const weeklyChartData = (weeklyAppointments ?? []).map((d, i) => ({
    day: d.day,
    appointments: d.appointments,
    completed: weeklyCompleted?.[i]?.completed ?? 0,
  }));

  const totalWeeklyAppts = weeklyChartData.reduce((s, d) => s + d.appointments, 0);
  const totalWeeklyCompleted = weeklyChartData.reduce((s, d) => s + d.completed, 0);
  const workingTodayCount = todaySchedule?.filter((schedule) => schedule.status === "working").length ?? 0;

  return (
    <>
      {/* Hero KPIs */}
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.gabinet.todayAppointments"), value: kpis.todayAppointments, color: "text-primary" },
          { label: t("sidebar.gabinet.confirmedToday"), value: kpis.confirmedToday, color: "text-emerald-500" },
        ]}
      />
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.gabinet.totalPatients"), value: kpis.totalPatients },
          { label: t("sidebar.gabinet.activeEmployees"), value: kpis.activeEmployees },
        ]}
      />

      {/* Smart Agenda */}
      {user?._id && <SmartAgenda organizationId={organizationId} userId={user._id} />}

      {/* Weekly Appointments Chart */}
      {weeklyChartData.length > 0 && (
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="flex flex-col gap-0.5 px-3 py-2.5">
            <span className="text-sm font-semibold">
              {t("sidebar.gabinet.weeklyOverview", "Przegląd tygodnia")}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-[10px]">
                <span className="text-foreground font-semibold">{totalWeeklyAppts}</span>{" "}
                {t("sidebar.gabinet.appointmentsShort", "wizyt")}
              </span>
              <span className="text-muted-foreground text-[10px]">
                <span className="text-emerald-500 font-semibold">{totalWeeklyCompleted}</span>{" "}
                {t("sidebar.gabinet.completedShort", "wykonanych")}
              </span>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="px-2 pt-2 pb-3">
            <ChartContainer config={weeklyChartConfig} className="aspect-auto h-28 w-full">
              <AreaChart
                data={weeklyChartData}
                margin={{ left: 5, right: 5, top: 5, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="fillAppts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-appointments)" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="var(--color-appointments)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="fillCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-completed)" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 9 }}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent />}
                />
                <Area
                  dataKey="completed"
                  type="monotone"
                  fill="url(#fillCompleted)"
                  stroke="var(--color-completed)"
                  strokeWidth={1.5}
                  stackId="a"
                />
                <Area
                  dataKey="appointments"
                  type="monotone"
                  fill="url(#fillAppts)"
                  stroke="var(--color-appointments)"
                  strokeWidth={1.5}
                  stackId="a"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Today's staff schedule */}
      {todaySchedule && todaySchedule.length > 0 && (
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="flex flex-col gap-0.5 px-3 py-2.5">
            <span className="text-sm font-semibold">
              {t("sidebar.gabinet.todayStaffSchedule", "Grafik na dziś")}
            </span>
            <span className="text-muted-foreground text-[10px]">
              {workingTodayCount}{" "}
              {t("sidebar.gabinet.staffWorking", "pracuje")}
            </span>
          </CardHeader>
          <Separator />
          <CardContent className="px-3 py-2.5">
            <StaffSchedule items={todaySchedule} />
          </CardContent>
        </Card>
      )}

      {/* Staff load bars */}
      {staffLoad && staffLoad.length > 0 && <StaffLoad staff={staffLoad} />}
    </>
  );
}
