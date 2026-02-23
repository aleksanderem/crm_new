import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { EllipsisVerticalIcon } from "@/lib/ez-icons";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const listItems = ["Share", "Update", "Refresh"];

const defaultPipelineData = [
  { stageName: "New", stageColor: "var(--chart-1)", count: 8, totalValue: 0 },
  { stageName: "Qualified", stageColor: "var(--chart-2)", count: 5, totalValue: 0 },
  { stageName: "Proposal", stageColor: "var(--chart-3)", count: 3, totalValue: 0 },
  { stageName: "Negotiation", stageColor: "var(--chart-4)", count: 2, totalValue: 0 },
  { stageName: "Won", stageColor: "var(--chart-5)", count: 1, totalValue: 0 },
];

interface CrmPipelineChartProps {
  data?: {
    stageName: string;
    stageColor: string;
    count: number;
    totalValue: number;
  }[];
  className?: string;
  blurred?: boolean;
}

const pipelineChartConfig = {
  deals: {
    label: "Deals",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

export function CrmPipelineChart({ data = defaultPipelineData, className, blurred = false }: CrmPipelineChartProps) {
  const { t } = useTranslation();

  const chartData = useMemo(
    () =>
      data.map((s) => ({
        stage: s.stageName,
        deals: s.count,
        fill: s.stageColor || "var(--color-deals)",
      })),
    [data]
  );

  const maxDeals = useMemo(() => {
    const max = Math.max(...data.map((d) => d.count), 0);
    return Math.ceil((max * 1.3) / 5) * 5 || 10;
  }, [data]);

  return (
    <Card className={className}>
      <CardHeader className="flex justify-between border-b">
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold">
            {t("dashboard.dealsByStage")}
          </span>
          <span className="text-muted-foreground text-sm">
            Current pipeline overview
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-6 rounded-full"
            >
              <EllipsisVerticalIcon />
              <span className="sr-only">Menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {listItems.map((item, index) => (
                <DropdownMenuItem key={index}>{item}</DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="relative flex flex-1 flex-col">
        <ChartContainer
          config={pipelineChartConfig}
          className="w-full"
          style={{ height: Math.max(200, chartData.length * 48) }}
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            barSize={24}
            margin={{ left: 8, right: 25 }}
          >
            <CartesianGrid
              horizontal={false}
              strokeDasharray="4"
              stroke="var(--border)"
            />
            <XAxis
              type="number"
              dataKey="deals"
              domain={[0, maxDeals]}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            />
            <YAxis
              dataKey="stage"
              type="category"
              tickLine={false}
              tickMargin={8}
              axisLine={false}
              fontSize={13}
              width={140}
            />
            {!blurred && (
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
            )}
            <Bar dataKey="deals" radius={6}>
              <LabelList
                dataKey="deals"
                offset={24}
                position="insideLeft"
                fill="var(--primary-foreground)"
                className="text-sm"
              />
            </Bar>
          </BarChart>
        </ChartContainer>
        {blurred && (
          <div className="absolute inset-0 backdrop-blur-[3px] bg-card/40" />
        )}
      </CardContent>
    </Card>
  );
}
