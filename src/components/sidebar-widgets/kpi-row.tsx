import { cn } from "@/utils/misc";
import { TrendingUp, TrendingDown } from "lucide-react";

type KpiColor = "text-emerald-500" | "text-primary" | "text-red-500" | "text-amber-500";

const KPI_ACCENT_BG_BY_COLOR: Record<KpiColor, string> = {
  "text-emerald-500": "bg-emerald-500",
  "text-primary": "bg-primary",
  "text-red-500": "bg-red-500",
  "text-amber-500": "bg-amber-500",
};

export interface KpiItem {
  label: string;
  value: string | number;
  trend?: { value: number; positive: boolean };
  color?: KpiColor;
}

interface KpiRowProps {
  items: KpiItem[];
  size?: "default" | "hero";
}

function accentBg(color?: KpiColor) {
  return color ? KPI_ACCENT_BG_BY_COLOR[color] : "bg-primary/50";
}

export function KpiRow({ items, size = "default" }: KpiRowProps) {
  if (size === "hero") {
    return (
      <div
        className={cn(
          "grid gap-2",
          items.length === 2 && "grid-cols-2",
          items.length >= 3 && "grid-cols-3",
        )}
      >
        {items.map((item) => (
          <div
            key={item.label}
            className="bg-card relative flex flex-col overflow-hidden rounded-lg border px-3 py-2.5"
          >
            <div className={cn("absolute inset-x-0 top-0 h-0.5", accentBg(item.color))} />
            <span className="text-muted-foreground mb-0.5 text-[10px] leading-none tracking-wide">
              {item.label}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  "text-xl font-semibold tracking-tight tabular-nums",
                  item.color ?? "text-foreground",
                )}
              >
                {typeof item.value === "number"
                  ? item.value.toLocaleString("pl-PL")
                  : item.value}
              </span>
              {item.trend && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-1 py-0.5 text-[9px] font-semibold leading-none",
                    item.trend.positive
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-red-500/10 text-red-600 dark:text-red-400",
                  )}
                >
                  {item.trend.positive ? (
                    <TrendingUp className="h-2.5 w-2.5" />
                  ) : (
                    <TrendingDown className="h-2.5 w-2.5" />
                  )}
                  {Math.abs(item.trend.value)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-1.5",
        items.length === 2 && "grid-cols-2",
        items.length >= 3 && "grid-cols-3",
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-muted/40 flex flex-col rounded-md px-2 py-1.5"
        >
          <span
            className={cn(
              "text-sm font-semibold tabular-nums leading-tight",
              item.color ?? "text-foreground",
            )}
          >
            {typeof item.value === "number"
              ? item.value.toLocaleString("pl-PL")
              : item.value}
          </span>
          <span className="text-muted-foreground text-[9px] leading-tight">
            {item.label}
          </span>
          {item.trend && (
            <span
              className={cn(
                "mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-medium",
                item.trend.positive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400",
              )}
            >
              {item.trend.positive ? (
                <TrendingUp className="h-2 w-2" />
              ) : (
                <TrendingDown className="h-2 w-2" />
              )}
              {Math.abs(item.trend.value)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
