import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { MiniFunnel } from "../mini-funnel";
import { RecentItems } from "../recent-items";
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
  useSupabaseDealsKpis,
  useSupabaseLeadsByStage,
  useSupabaseWeeklyDealsTrend,
} from "@/hooks/use-supabase-sidebar-widgets";

const trendConfig = {
  created: {
    label: "Nowe",
    color: "var(--chart-1)",
  },
  won: {
    label: "Wygrane",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

const winRateConfig = {
  winRate: {
    label: "Win rate",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export function DealsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const { data: kpis } = useSupabaseDealsKpis(organizationId as string);
  const { data: stages } = useSupabaseLeadsByStage(organizationId as string);
  const { data: weeklyTrend } = useSupabaseWeeklyDealsTrend(organizationId as string);

  if (!kpis) return null;

  const totalCreated = weeklyTrend?.reduce((s, d) => s + d.created, 0) ?? 0;
  const totalWon = weeklyTrend?.reduce((s, d) => s + d.won, 0) ?? 0;

  // Win rate gauge
  const winRate = kpis.winRate;
  const endAngle = 180 - (winRate / 100) * 180;
  const gaugeData = [{ value: winRate, fill: "var(--color-winRate)" }];
  const gaugeColor =
    winRate >= 50 ? "text-emerald-500" : winRate >= 30 ? "text-amber-500" : "text-red-500";

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.open"), value: kpis.openCount, color: "text-primary" },
          { label: t("sidebar.pipeline"), value: kpis.pipelineValue >= 1000 ? `${Math.round(kpis.pipelineValue / 1000)}K` : kpis.pipelineValue },
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
                {t("sidebar.newDealsShort", "nowych")}
              </span>
              <span className="text-muted-foreground text-[10px]">
                <span className="text-primary font-semibold">{totalWon}</span>{" "}
                {t("sidebar.wonDealsShort", "wygranych")}
              </span>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="px-2 pt-2 pb-3">
            <ChartContainer config={trendConfig} className="aspect-auto h-28 w-full">
              <AreaChart data={weeklyTrend} margin={{ left: 5, right: 5, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillDealsCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-created)" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="var(--color-created)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="fillDealsWon" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-won)" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="var(--color-won)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 9 }} interval={0} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Area dataKey="won" type="monotone" fill="url(#fillDealsWon)" stroke="var(--color-won)" strokeWidth={1.5} stackId="a" />
                <Area dataKey="created" type="monotone" fill="url(#fillDealsCreated)" stroke="var(--color-created)" strokeWidth={1.5} stackId="a" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Win Rate gauge */}
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="flex flex-col gap-0.5 px-3 py-2.5">
          <span className="text-sm font-semibold">Win Rate</span>
          <span className="text-muted-foreground text-[10px]">
            {t("sidebar.winRateDesc", "Współczynnik wygranych")}
          </span>
        </CardHeader>
        <Separator />
        <CardContent className="px-2 pt-2 pb-4">
          <ChartContainer config={winRateConfig} className="mx-auto h-32 w-full">
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
                            {winRate}%
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 4}
                            className="fill-muted-foreground text-xs"
                          >
                            Win Rate
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

      {stages && stages.length > 0 && <MiniFunnel stages={stages} />}
      <RecentItems organizationId={organizationId} entityType="leads" linkPrefix="/dashboard/leads/" />
    </>
  );
}
