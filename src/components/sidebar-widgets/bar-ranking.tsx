import { Bar, BarChart, Cell, ResponsiveContainer } from "recharts";

export interface RankingItem {
  label: string;
  value: number;
  color?: string;
}

interface BarRankingProps {
  items: RankingItem[];
  unit?: string;
}

const rankColors = [
  "var(--color-primary)",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function BarRanking({ items, unit }: BarRankingProps) {
  return (
    <div className="flex flex-col gap-1">
      {/* Mini sparkbar chart */}
      <div className="h-10 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={items}
            layout="horizontal"
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            barCategoryGap="20%"
          >
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {items.map((_, idx) => (
                <Cell key={idx} fill={rankColors[idx % rankColors.length]} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend rows */}
      <div className="flex flex-col gap-1">
        {items.map((item, idx) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[8px] font-bold text-white"
              style={{ backgroundColor: rankColors[idx % rankColors.length] }}
            >
              {idx + 1}
            </span>
            <span className="text-foreground min-w-0 flex-1 truncate text-[10px] font-medium">
              {item.label}
            </span>
            <span className="text-muted-foreground shrink-0 text-[10px] font-semibold tabular-nums">
              {item.value.toLocaleString("pl-PL")}
              {unit ?? ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
