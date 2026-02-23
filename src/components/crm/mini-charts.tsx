import { useId } from "react";
import { Area, AreaChart, Bar, BarChart } from "recharts";
import {
  Card,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const chartConfig = {
  value: { label: "Count", color: "var(--chart-2)" },
} satisfies ChartConfig;

function MiniChartCard({
  title,
  data,
  chartType,
  timeRange,
  onTimeRangeChange,
  isLoading = false,
}: MiniChartCardProps) {
  const { t } = useTranslation();
  const gradientId = useId();

  if (isLoading) {
    return (
      <Card className="gap-4">
        <CardHeader className="gap-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <div className="overflow-hidden px-6">
          <Skeleton className="h-21 w-full" />
        </div>
      </Card>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card className="gap-4">
      <CardHeader className="gap-1">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <span className="text-2xl font-semibold">{total.toLocaleString()}</span>
        <Select
          value={timeRange}
          onValueChange={(val) => onTimeRangeChange(val as TimeRange)}
        >
          <SelectTrigger className="text-muted-foreground h-auto w-fit gap-1 border-0 p-0 text-sm shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGE_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {t(`timeRange.${opt}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>

      <ChartContainer config={chartConfig} className="h-21 w-full overflow-hidden px-2.75">
        {chartType === "bar" ? (
          <BarChart
            accessibilityLayer
            data={data}
            barSize={12}
            margin={{ left: 0, right: 0 }}
          >
            <Bar
              dataKey="value"
              fill="var(--color-value)"
              background={{
                fill: "color-mix(in oklab, var(--primary) 10%, transparent)",
                radius: 12,
              }}
              radius={12}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
          </BarChart>
        ) : (
          <AreaChart
            data={data}
            margin={{ left: 0, right: 0 }}
            className="stroke-2"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="10%"
                  stopColor="var(--chart-2)"
                  stopOpacity={0.4}
                />
                <stop
                  offset="90%"
                  stopColor="var(--chart-2)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Area
              dataKey="value"
              type="natural"
              fill={`url(#${gradientId})`}
              stroke="var(--chart-2)"
              stackId="a"
            />
          </AreaChart>
        )}
      </ChartContainer>
    </Card>
  );
}

export interface MiniChartsRowProps {
  leftChart: MiniChartCardProps;
  rightChart: MiniChartCardProps;
}

export function MiniChartsRow({ leftChart, rightChart }: MiniChartsRowProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <MiniChartCard {...leftChart} />
      <MiniChartCard {...rightChart} />
    </div>
  );
}

export { MiniChartCard };
