import { cn } from "@/utils/misc";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
} from "recharts";

type KpiColor = "text-emerald-500" | "text-primary" | "text-red-500" | "text-amber-500";

const KPI_ACCENT_BG_BY_COLOR: Record<KpiColor, string> = {
  "text-emerald-500": "bg-emerald-500",
  "text-primary": "bg-primary",
  "text-red-500": "bg-red-500",
  "text-amber-500": "bg-amber-500",
};

const KPI_STROKE_BY_COLOR: Record<KpiColor, string> = {
  "text-emerald-500": "hsl(var(--chart-2))",
  "text-primary": "hsl(var(--primary))",
  "text-red-500": "hsl(var(--destructive))",
  "text-amber-500": "hsl(var(--chart-4))",
};

export interface KpiItem {
  label: string;
  value: string | number;
  trend?: { value: number; positive: boolean };
  color?: KpiColor;
  /** Mini sparkline data points (just numbers) */
  sparkline?: number[];
  /** Radial gauge: 0–100 */
  gauge?: number;
}

interface KpiRowProps {
  items: KpiItem[];
  size?: "default" | "hero";
}

function accentBg(color?: KpiColor) {
  return color ? KPI_ACCENT_BG_BY_COLOR[color] : "bg-primary/50";
}

function strokeColor(color?: KpiColor) {
  return color ? KPI_STROKE_BY_COLOR[color] : "hsl(var(--primary))";
}

function MiniSparkline({ data, color }: { data: number[]; color?: KpiColor }) {
  const chartData = data.map((v, i) => ({ i, v }));
  const stroke = strokeColor(color);
  return (
    <div className="h-8 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`spark-${stroke.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1.5}
            fill={`url(#spark-${stroke.replace(/[^a-z0-9]/gi, "")})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function MiniGauge({ value, color }: { value: number; color?: KpiColor }) {
  const fill = strokeColor(color);
  const data = [{ value, fill }];
  return (
    <div className="h-10 w-10 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="70%"
          outerRadius="100%"
          data={data}
          startAngle={90}
          endAngle={-270}
          barSize={4}
        >
          <RadialBar
            dataKey="value"
            background={{ fill: "hsl(var(--muted))" }}
            cornerRadius={4}
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KpiRow({ items, size = "default" }: KpiRowProps) {
  if (size === "hero") {
    return (
      <div
        className="grid grid-cols-2 gap-2"
      >
        {items.map((item) => (
          <div
            key={item.label}
            className="bg-card relative flex flex-col overflow-hidden rounded-lg border px-3 py-2.5 min-w-0"
          >
            <div className={cn("absolute inset-x-0 top-0 h-0.5", accentBg(item.color))} />
            <span className="text-muted-foreground mb-0.5 text-[10px] leading-none tracking-wide">
              {item.label}
            </span>
            <div className="flex items-center gap-2">
              <div className="flex flex-col min-w-0">
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
              {item.gauge != null && <MiniGauge value={item.gauge} color={item.color} />}
            </div>
            {item.sparkline && item.sparkline.length > 1 && (
              <MiniSparkline data={item.sparkline} color={item.color} />
            )}
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
