import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { StaffLoad } from "../staff-load";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";

const gaugeConfig = {
  attendance: {
    label: "Frekwencja",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export function GabinetReportsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.gabinet.sidebarWidgets.getReportsKpis, { organizationId });
  const staffLoad = useQuery(api.gabinet.sidebarWidgets.getStaffLoad, { organizationId });

  if (!kpis) return null;

  // Gauge: map 0-100% attendance to 0-360 degrees on a semicircle (180° arc)
  const attendancePct = kpis.attendance;
  const endAngle = 180 - (attendancePct / 100) * 180;
  const gaugeData = [{ value: attendancePct, fill: "var(--color-attendance)" }];
  const gaugeColor =
    attendancePct >= 80 ? "text-emerald-500" : attendancePct >= 50 ? "text-amber-500" : "text-red-500";

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.gabinet.thisMonthAppointments"), value: kpis.thisMonthAppointments, color: "text-primary" },
          {
            label: t("sidebar.gabinet.visitTrend"),
            value: `${kpis.visitTrend > 0 ? "+" : ""}${kpis.visitTrend}%`,
            color: kpis.visitTrend > 0 ? "text-emerald-500" : kpis.visitTrend < 0 ? "text-red-500" : undefined,
          },
        ]}
      />

      {/* Attendance gauge */}
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="flex flex-col gap-0.5 px-3 py-2.5">
          <span className="text-sm font-semibold">
            {t("sidebar.gabinet.attendance", "Frekwencja")}
          </span>
          <span className="text-muted-foreground text-[10px]">
            {t("sidebar.gabinet.attendanceDesc", "Procent zrealizowanych wizyt")}
          </span>
        </CardHeader>
        <Separator />
        <CardContent className="px-2 pt-2 pb-4">
          <ChartContainer config={gaugeConfig} className="mx-auto h-32 w-full">
            <RadialBarChart
              data={gaugeData}
              startAngle={180}
              endAngle={endAngle}
              innerRadius={60}
              outerRadius={95}
              cx="50%"
              cy="85%"
            >
              <PolarGrid
                gridType="circle"
                radialLines={false}
                stroke="none"
                className="first:fill-muted/50 last:fill-card"
                polarRadius={[88, 67]}
              />
              <RadialBar dataKey="value" cornerRadius={6} />
              <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) - 16}
                            className={`fill-current text-2xl font-bold ${gaugeColor}`}
                          >
                            {attendancePct}%
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 4}
                            className="fill-muted-foreground text-xs"
                          >
                            {t("sidebar.gabinet.attendance", "Frekwencja")}
                          </tspan>
                        </text>
                      );
                    }
                  }}
                />
              </PolarRadiusAxis>
            </RadialBarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Staff load bars */}
      {staffLoad && staffLoad.length > 0 && <StaffLoad staff={staffLoad} />}
    </>
  );
}
