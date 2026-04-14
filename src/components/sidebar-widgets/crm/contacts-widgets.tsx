import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { SourceBar } from "../source-bar";
import { RecentItems } from "../recent-items";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const trendConfig = {
  value: {
    label: "Nowe kontakty",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function ContactsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getContactsKpis, { organizationId });
  const nudges = useQuery(api.nudges.getContactsNudges, { organizationId });
  const sources = useQuery(api.sidebarWidgets.getContactsBySource, { organizationId });
  const weeklyTrend = useQuery(api.sidebarWidgets.getWeeklyContactsTrend, { organizationId });

  if (!kpis) return null;

  const totalWeek = weeklyTrend?.reduce((s, d) => s + d.value, 0) ?? 0;

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.total"), value: kpis.total },
          { label: t("sidebar.newThisWeek"), value: kpis.newThisWeek },
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
              {t("sidebar.newContactsShort", "nowych kontaktów")}
            </span>
          </CardHeader>
          <Separator />
          <CardContent className="px-2 pt-2 pb-3">
            <ChartContainer config={trendConfig} className="aspect-auto h-28 w-full">
              <AreaChart data={weeklyTrend} margin={{ left: 5, right: 5, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillContacts" x1="0" y1="0" x2="0" y2="1">
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
                  fill="url(#fillContacts)"
                  stroke="var(--color-value)"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {nudges?.map((n, index) => (
        <NudgeCard
          key={`${n.message}-${index}`}
          message={n.message}
          messageValues={n.messageValues}
          severity={n.severity}
          icon={n.icon}
        />
      ))}
      {sources && sources.length > 0 && <SourceBar segments={sources} />}
      <RecentItems organizationId={organizationId} entityType="contacts" linkPrefix="/dashboard/contacts/" />
    </>
  );
}
