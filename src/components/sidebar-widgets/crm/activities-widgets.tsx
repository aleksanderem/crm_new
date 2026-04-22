import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import {
  useSupabaseActivitiesKpis,
  useSupabaseWeeklyActivitiesTrend,
} from "@/hooks/use-supabase-scheduled-activities";
import { KpiRow } from "../kpi-row";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  Label,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
} from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const trendConfig = {
  created: {
    label: "Nowe",
    color: "var(--chart-1)",
  },
  completed: {
    label: "Ukończone",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

const completionConfig = {
  completion: {
    label: "Wykonanie",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export function ActivitiesWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const user = useQuery(api.app.getCurrentUser);
  const { data: kpis } = useSupabaseActivitiesKpis(
    organizationId,
    user?._id ?? "",
    { enabled: !!user?._id },
  );
  const { data: weeklyTrend } = useSupabaseWeeklyActivitiesTrend(
    organizationId,
    user?._id ?? "",
    { enabled: !!user?._id },
  );

  if (!kpis) return null;

  const totalCreated = weeklyTrend?.reduce((s, d) => s + d.created, 0) ?? 0;
  const totalCompleted = weeklyTrend?.reduce((s, d) => s + d.completed, 0) ?? 0;

  // Completion rate gauge
  const rate = kpis.completionRate;
  const endAngle = 180 - (rate / 100) * 180;
  const gaugeData = [{ value: rate, fill: "var(--color-completion)" }];
  const gaugeColor =
    rate >= 70 ? "text-emerald-500" : rate >= 40 ? "text-amber-500" : "text-red-500";

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          {
            label: t("sidebar.overdue"),
            value: kpis.overdue,
            color: kpis.overdue > 0 ? "text-red-500" : undefined,
          },
          { label: t("sidebar.today"), value: kpis.today },
        ]}
      />

      {weeklyTrend && weeklyTrend.length > 0 && (
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="flex flex-col gap-0.5 px-3 py-2.5">
            <span className="text-sm font-semibold">
              {t("sidebar.weeklyOverview", "Przegląd tygodnia")}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-[10px]">
                <span className="text-foreground font-semibold">{totalCreated}</span>{" "}
                {t("sidebar.createdShort", "nowych")}
              </span>
              <span className="text-muted-foreground text-[10px]">
                <span className="text-primary font-semibold">{totalCompleted}</span>{" "}
                {t("sidebar.completedShort", "ukończonych")}
              </span>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="px-2 pt-2 pb-3">
            <ChartContainer config={trendConfig} className="aspect-auto h-28 w-full">
              <AreaChart data={weeklyTrend} margin={{ left: 5, right: 5, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillActCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-created)" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="var(--color-created)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="fillActCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-completed)" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 9 }} interval={0} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Area dataKey="completed" type="monotone" fill="url(#fillActCompleted)" stroke="var(--color-completed)" strokeWidth={1.5} stackId="a" />
                <Area dataKey="created" type="monotone" fill="url(#fillActCreated)" stroke="var(--color-created)" strokeWidth={1.5} stackId="a" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Completion rate gauge */}
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="flex flex-col gap-0.5 px-3 py-2.5">
          <span className="text-sm font-semibold">{t("sidebar.completionRate", "Wykonanie")}</span>
          <span className="text-muted-foreground text-[10px]">
            {t("sidebar.completionRateDesc", "Współczynnik ukończenia")}
          </span>
        </CardHeader>
        <Separator />
        <CardContent className="px-2 pt-2 pb-4">
          <ChartContainer config={completionConfig} className="mx-auto h-32 w-full">
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
                            {rate}%
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 4}
                            className="fill-muted-foreground text-xs"
                          >
                            {t("sidebar.completionRate", "Wykonanie")}
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
    </>
  );
}
