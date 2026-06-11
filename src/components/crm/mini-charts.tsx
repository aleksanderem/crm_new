import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/utils/misc";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "@/lib/ez-icons";
import type { TimeRange } from "./types";

export interface MiniChartData {
  label: string;
  value: number;
}

export interface MiniChartCardProps {
  title: string;
  data: MiniChartData[];
  /** @deprecated kept for backwards compat — ignored */
  chartType?: "line" | "bar";
  /** @deprecated kept for backwards compat — ignored */
  timeRange?: TimeRange;
  /** @deprecated kept for backwards compat — ignored */
  onTimeRangeChange?: (range: TimeRange) => void;
  isLoading?: boolean;
  accentColor?: string;
}

const ACCENT_COLORS = [
  "bg-primary",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-muted-foreground/40",
];

function MetricCard({
  title,
  data,
  isLoading = false,
}: MiniChartCardProps) {
  if (isLoading) {
    return (
      <Card className="gap-0 py-0">
        <CardHeader className="gap-1 px-4 pt-4 pb-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
        </CardHeader>
        <CardContent className="space-y-2 px-4 pb-4">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const topItems = sorted.slice(0, 5);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="gap-0.5 px-4 pt-4 pb-3">
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide">
          {title}
        </CardTitle>
        <span className="text-2xl font-semibold tabular-nums tracking-tight">
          {total.toLocaleString("pl-PL")}
        </span>
      </CardHeader>

      {topItems.length > 0 && (
        <CardContent className="px-4 pb-4 pt-0">
          {/* Stacked segment bar */}
          {total > 0 && (
            <div className="mb-3 flex h-2 w-full overflow-hidden rounded-full">
              {topItems.map((item, i) => {
                const pct = (item.value / total) * 100;
                if (pct < 1) return null;
                return (
                  <div
                    key={item.label}
                    className={cn("h-full first:rounded-l-full last:rounded-r-full", ACCENT_COLORS[i % ACCENT_COLORS.length])}
                    style={{ width: `${pct}%` }}
                  />
                );
              })}
            </div>
          )}

          {/* Item breakdown */}
          <div className="space-y-1.5">
            {topItems.map((item, i) => {
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
              return (
                <div key={item.label} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      ACCENT_COLORS[i % ACCENT_COLORS.length],
                    )}
                  />
                  <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                    {item.label}
                  </span>
                  <span className="text-foreground text-xs font-medium tabular-nums">
                    {item.value.toLocaleString("pl-PL")}
                  </span>
                  <span className="text-muted-foreground w-8 text-right text-[10px] tabular-nums">
                    {pct}%
                  </span>
                </div>
              );
            })}
            {sorted.length > 5 && (
              <div className="text-muted-foreground text-[10px]">
                +{sorted.length - 5} więcej
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export interface MiniChartsRowProps {
  leftChart: MiniChartCardProps;
  rightChart: MiniChartCardProps;
  /**
   * When provided, the row becomes collapsible and the open/closed state is
   * persisted in localStorage under this key. Defaults to collapsed on first
   * visit so the table is visible without scrolling.
   */
  storageKey?: string;
}

export function MiniChartsRow({ leftChart, rightChart, storageKey }: MiniChartsRowProps) {
  const charts = (
    <div className="grid gap-4 sm:grid-cols-2">
      <MetricCard {...leftChart} />
      <MetricCard {...rightChart} />
    </div>
  );

  if (!storageKey) return charts;

  return <CollapsibleCharts storageKey={storageKey}>{charts}</CollapsibleCharts>;
}

function CollapsibleCharts({
  storageKey,
  children,
}: {
  storageKey: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const lsKey = `mini-charts:${storageKey}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(lsKey);
      if (stored === "1") return true;
      if (stored === "0") return false;
    } catch { /* ignore */ }
    return false;
  });

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(lsKey, next ? "1" : "0");
      } catch { /* ignore */ }
      return next;
    });
  }, [lsKey]);

  return (
    <div className="space-y-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={toggle}
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground -ml-2 h-7 gap-1 px-2 text-xs"
      >
        {open ? (
          <ChevronUp className="h-3.5 w-3.5" variant="stroke" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" variant="stroke" />
        )}
        {open
          ? t("common.hideStatistics", { defaultValue: "Ukryj statystyki" })
          : t("common.showStatistics", { defaultValue: "Pokaż statystyki" })}
      </Button>
      {open && children}
    </div>
  );
}

export { MetricCard as MiniChartCard };
