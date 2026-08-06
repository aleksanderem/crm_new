import { useAction } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { SourceBar } from "../source-bar";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import {
  useSupabaseFormDocumentsKpis,
  useSupabaseFormDocumentsByStatus,
  useSupabaseWeeklyFormDocumentsTrend,
  useSupabaseTopDocumentCategories,
} from "@/hooks/use-supabase-sidebar-widgets";

const trendConfig = {
  value: {
    label: "Nowe dokumenty",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const CATEGORY_COLORS = [
  { bg: "bg-primary/10", text: "text-primary", indicator: "**:data-[slot=progress-indicator]:bg-primary", track: "**:data-[slot=progress-track]:bg-primary/10" },
  { bg: "bg-sky-400/10", text: "text-sky-400", indicator: "**:data-[slot=progress-indicator]:bg-sky-400", track: "**:data-[slot=progress-track]:bg-sky-400/10" },
  { bg: "bg-emerald-500/10", text: "text-emerald-500", indicator: "**:data-[slot=progress-indicator]:bg-emerald-500", track: "**:data-[slot=progress-track]:bg-emerald-500/10" },
  { bg: "bg-amber-500/10", text: "text-amber-500", indicator: "**:data-[slot=progress-indicator]:bg-amber-500", track: "**:data-[slot=progress-track]:bg-amber-500/10" },
  { bg: "bg-rose-500/10", text: "text-rose-500", indicator: "**:data-[slot=progress-indicator]:bg-rose-500", track: "**:data-[slot=progress-track]:bg-rose-500/10" },
];

export function DocumentsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const { data: kpis } = useSupabaseFormDocumentsKpis(organizationId as string);
  const { data: byStatus } = useSupabaseFormDocumentsByStatus(organizationId as string);
  const { data: weeklyTrend } = useSupabaseWeeklyFormDocumentsTrend(organizationId as string);
  const { data: topCategories } = useSupabaseTopDocumentCategories(organizationId as string);
  const listTagDefinitionsAction = useAction(api.tagDefinitions.list);
  const { data: tagDefinitions } = useTanstackQuery({
    queryKey: ["tagDefinitions.list", organizationId],
    queryFn: () => listTagDefinitionsAction({ organizationId }),
    enabled: !!organizationId,
  }) as { data: any[] | undefined };
  const listCategoryDefinitionsAction = useAction(api.categoryDefinitions.list);
  const { data: categoryDefinitions } = useTanstackQuery({
    queryKey: ["categoryDefinitions.list", organizationId, "document"],
    queryFn: () => listCategoryDefinitionsAction({
      organizationId,
      entityType: "document",
    } as any),
    enabled: !!organizationId,
  }) as { data: any[] | undefined };

  if (!kpis) return null;

  const totalWeek = weeklyTrend?.reduce((s, d) => s + d.value, 0) ?? 0;
  const maxCategory = topCategories && topCategories.length > 0
    ? Math.max(...topCategories.map((c) => c.value))
    : 1;

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.total", "Wszystkich"), value: kpis.total },
          { label: t("sidebar.newThisMonth", "W tym miesiącu"), value: kpis.newThisMonth, color: "text-emerald-500" },
        ]}
      />

      <KpiRow
        items={[
          { label: t("sidebar.pendingSignature", "Do podpisu"), value: kpis.pendingSignature, color: "text-amber-500" },
          { label: t("sidebar.signed", "Podpisane"), value: kpis.signed, color: "text-emerald-500" },
          { label: t("sidebar.signRate", "% podpisów"), value: `${kpis.signRate}%`, color: "text-primary" },
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
              {t("sidebar.newDocumentsShort", "nowych dokumentów")}
            </span>
          </CardHeader>
          <Separator />
          <CardContent className="px-2 pt-2 pb-3">
            <ChartContainer config={trendConfig} className="aspect-auto h-28 w-full">
              <AreaChart data={weeklyTrend} margin={{ left: 5, right: 5, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillDocuments" x1="0" y1="0" x2="0" y2="1">
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
                  fill="url(#fillDocuments)"
                  stroke="var(--color-value)"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {byStatus && byStatus.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
            {t("sidebar.byStatus", "Wg statusu")}
          </span>
          <SourceBar segments={byStatus} />
        </div>
      )}

      {categoryDefinitions && categoryDefinitions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
            {t("sidebar.categories", "Kategorie")}
          </span>
          <div className="flex flex-wrap gap-1">
            {categoryDefinitions.map((cat) => (
              <span
                key={cat._id}
                className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium"
                style={cat.color ? { borderColor: `${cat.color}40`, color: cat.color } : undefined}
              >
                {cat.color && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                )}
                {cat.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {tagDefinitions && tagDefinitions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
            {t("sidebar.tags", "Tagi")}
          </span>
          <div className="flex flex-wrap gap-1">
            {tagDefinitions.map((tag: { _id: string; name: string; color: string }) => (
              <span
                key={tag._id}
                className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium"
                style={{ borderColor: `${tag.color}40`, color: tag.color }}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {topCategories && topCategories.length > 0 && (
        <Card className="gap-0 py-3 shadow-none">
          <CardHeader className="px-3 pb-2">
            <span className="text-sm font-semibold">
              {t("sidebar.topCategories", "Top kategorie")}
            </span>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 px-3">
            {topCategories.map((cat, i) => {
              const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
              const pct = Math.round((cat.value / maxCategory) * 100);
              return (
                <div key={cat.label}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="truncate text-xs font-medium">{cat.label}</span>
                    <Badge className={cn("ml-2 h-auto shrink-0 px-1.5 py-0.5 text-[10px]", color.bg, color.text)}>
                      {cat.value}
                    </Badge>
                  </div>
                  <Progress
                    value={pct}
                    className={cn("w-full [&>div]:h-1", color.indicator, color.track)}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}
