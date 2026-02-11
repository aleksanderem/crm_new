import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import type { TimeRange } from "./types";

export interface MiniChartData {
  label: string;
  value: number;
}

const TIME_RANGE_OPTIONS: TimeRange[] = [
  "last7days",
  "last30days",
  "thisMonth",
  "last3months",
  "all",
];

export interface MiniChartCardProps {
  title: string;
  data: MiniChartData[];
  chartType: "line" | "bar";
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  isLoading?: boolean;
  accentColor?: string;
}

const CHART_BLUE = "#3b82f6";
const CHART_BLUE_LIGHT = "#93c5fd";

function MiniChartCard({
  title,
  data,
  chartType,
  timeRange,
  onTimeRangeChange,
  isLoading = false,
  accentColor,
}: MiniChartCardProps) {
  const { t } = useTranslation();
  const color = accentColor || CHART_BLUE;
  const colorLight = accentColor
    ? `${accentColor}40`
    : `${CHART_BLUE_LIGHT}60`;

  if (isLoading) {
    return (
      <Card className="flex-1 min-w-0">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Skeleton className="h-4 w-[120px]" />
          <Skeleton className="h-7 w-[100px]" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[140px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card className="flex-1 min-w-0 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
        <div>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <p className="text-2xl font-bold mt-0.5" style={{ color }}>
            {total.toLocaleString()}
          </p>
        </div>
        <select
          value={timeRange}
          onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
          className="h-7 rounded-md border bg-transparent px-2 text-xs text-muted-foreground"
        >
          {TIME_RANGE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {t(`timeRange.${opt}`)}
            </option>
          ))}
        </select>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "line" ? (
              <AreaChart data={data}>
                <defs>
                  <linearGradient id={`gradient-${title}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  strokeOpacity={0.5}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis hide />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2.5}
                  fill={`url(#gradient-${title})`}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: color,
                    stroke: "white",
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            ) : (
              <BarChart data={data}>
                <defs>
                  <linearGradient id={`bar-gradient-${title}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  strokeOpacity={0.5}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis hide />
                <Bar
                  dataKey="value"
                  fill={`url(#bar-gradient-${title})`}
                  stroke="#2563eb"
                  strokeWidth={1}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export interface MiniChartsRowProps {
  leftChart: MiniChartCardProps;
  rightChart: MiniChartCardProps;
}

export function MiniChartsRow({ leftChart, rightChart }: MiniChartsRowProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <MiniChartCard {...leftChart} />
      <MiniChartCard {...rightChart} />
    </div>
  );
}

export { MiniChartCard };
