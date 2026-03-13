import { cn } from "@/utils/misc";

export interface RankingItem {
  label: string;
  value: number;
  color?: string;
}

interface BarRankingProps {
  items: RankingItem[];
  unit?: string;
}

export function BarRanking({ items, unit }: BarRankingProps) {
  const maxValue = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item, idx) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className="text-muted-foreground w-16 shrink-0 truncate text-[10px]">
            {item.label}
          </span>
          <div className="bg-muted/50 h-2.5 flex-1 overflow-hidden rounded-full">
            <div
              className={cn("h-full rounded-full transition-all", item.color ?? "bg-primary")}
              style={{
                width: `${(item.value / maxValue) * 100}%`,
                opacity: 1 - idx * 0.2,
              }}
            />
          </div>
          <span className="text-foreground w-8 text-right text-[10px] font-medium tabular-nums">
            {item.value}
            {unit ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}
