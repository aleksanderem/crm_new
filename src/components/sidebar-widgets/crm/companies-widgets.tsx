import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { BarRanking } from "../bar-ranking";
import { RecentItems } from "../recent-items";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  useSupabaseCompaniesKpis,
  useSupabaseTopCompanies,
  useSupabaseWeeklyCompaniesTrend,
} from "@/hooks/use-supabase-sidebar-widgets";

const trendConfig = {
  value: {
    label: "Nowe firmy",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export function CompaniesWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const { data: kpis } = useSupabaseCompaniesKpis(organizationId as string);
  const { data: topCompanies } = useSupabaseTopCompanies(organizationId as string);
  const { data: weeklyTrend } = useSupabaseWeeklyCompaniesTrend(organizationId as string);

  if (!kpis) return null;

  const totalWeek = weeklyTrend?.reduce((s, d) => s + d.value, 0) ?? 0;

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.total"), value: kpis.total },
          { label: t("sidebar.newThisMonth"), value: kpis.newThisMonth },
          { label: t("sidebar.revenue"), value: kpis.totalRevenue >= 1000 ? `${Math.round(kpis.totalRevenue / 1000)}K` : kpis.totalRevenue },
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
              {t("sidebar.newCompaniesShort", "nowych firm")}
            </span>
          </CardHeader>
          <Separator />
          <CardContent className="px-2 pt-2 pb-3">
            <ChartContainer config={trendConfig} className="aspect-auto h-28 w-full">
              <AreaChart data={weeklyTrend} margin={{ left: 5, right: 5, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillCompanies" x1="0" y1="0" x2="0" y2="1">
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
                  fill="url(#fillCompanies)"
                  stroke="var(--color-value)"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {topCompanies && topCompanies.length > 0 && <BarRanking items={topCompanies} />}
      <RecentItems organizationId={organizationId} entityType="companies" linkPrefix="/dashboard/companies/" />
    </>
  );
}
