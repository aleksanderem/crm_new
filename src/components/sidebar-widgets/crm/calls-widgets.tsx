import type { Id } from "@cvx/_generated/dataModel";
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
import {
  useSupabaseCallsKpis,
  useSupabaseWeeklyCallsTrend,
} from "@/hooks/use-supabase-sidebar-widgets";

const trendConfig = {
  value: {
    label: "Połączenia",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const answerRateConfig = {
  answerRate: {
    label: "Odebrane",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export function CallsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const { data: kpis } = useSupabaseCallsKpis(organizationId as string);
  const { data: weeklyTrend } = useSupabaseWeeklyCallsTrend(organizationId as string);

  if (!kpis) return null;

  const totalWeek = weeklyTrend?.reduce((s, d) => s + d.value, 0) ?? 0;

  // Answer rate gauge
  const rate = kpis.answerRate;
  const endAngle = 180 - (rate / 100) * 180;
  const gaugeData = [{ value: rate, fill: "var(--color-answerRate)" }];
  const gaugeColor =
    rate >= 70 ? "text-emerald-500" : rate >= 40 ? "text-amber-500" : "text-red-500";

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.todayCalls"), value: kpis.todayCount },
          { label: t("sidebar.avgDuration"), value: `${kpis.avgDurationSec}s` },
        ]}
      />

      {weeklyTrend && weeklyTrend.length > 0 && (
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="flex flex-col gap-0.5 px-3 py-2.5">
            <span className="text-sm font-semibold">
              {t("sidebar.weeklyOverview", "Przegląd tygodnia")}
            </span>
            <span className="text-muted-foreground text-[10px]">
              <span className="text-foreground font-semibold">{totalWeek}</span>{" "}
              {t("sidebar.callsShort", "połączeń")}
            </span>
          </CardHeader>
          <Separator />
          <CardContent className="px-2 pt-2 pb-3">
            <ChartContainer config={trendConfig} className="aspect-auto h-28 w-full">
              <AreaChart data={weeklyTrend} margin={{ left: 5, right: 5, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillCalls" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 9 }} interval={0} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Area
                  dataKey="value"
                  type="monotone"
                  fill="url(#fillCalls)"
                  stroke="var(--color-value)"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Answer rate gauge */}
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="flex flex-col gap-0.5 px-3 py-2.5">
          <span className="text-sm font-semibold">{t("sidebar.answerRate", "Odebrane")}</span>
          <span className="text-muted-foreground text-[10px]">
            {t("sidebar.answerRateDesc", "Współczynnik odebranych")}
          </span>
        </CardHeader>
        <Separator />
        <CardContent className="px-2 pt-2 pb-4">
          <ChartContainer config={answerRateConfig} className="mx-auto h-32 w-full">
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
                            {t("sidebar.answerRate", "Odebrane")}
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
