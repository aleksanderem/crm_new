import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import {
  useSupabaseCalendarKpis,
  useSupabaseWeeklyActivitiesTrend,
} from "@/hooks/use-supabase-scheduled-activities";
import { KpiRow } from "../kpi-row";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
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

export function CalendarWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const user = useQuery(api.app.getCurrentUser);
  const { data: kpis } = useSupabaseCalendarKpis(
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

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.today"), value: kpis.today },
          {
            label: t("sidebar.overdue"),
            value: kpis.overdue,
            color: kpis.overdue > 0 ? "text-red-500" : undefined,
          },
          { label: t("sidebar.thisWeek"), value: kpis.thisWeek },
          {
            label: t("googleCalendar.calendar.incompleteSidebarKpi"),
            value: kpis.requiresCompletion,
            color: kpis.requiresCompletion > 0 ? "text-amber-500" : undefined,
          },
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
                  <linearGradient id="fillCalCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-created)" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="var(--color-created)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="fillCalCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-completed)" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 9 }} interval={0} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Area dataKey="completed" type="monotone" fill="url(#fillCalCompleted)" stroke="var(--color-completed)" strokeWidth={1.5} stackId="a" />
                <Area dataKey="created" type="monotone" fill="url(#fillCalCreated)" stroke="var(--color-created)" strokeWidth={1.5} stackId="a" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </>
  );
}
