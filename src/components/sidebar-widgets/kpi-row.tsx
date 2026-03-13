import { cn } from "@/utils/misc";

export interface KpiItem {
  label: string;
  value: string | number;
  trend?: { value: number; positive: boolean };
  color?: string;
}

interface KpiRowProps {
  items: KpiItem[];
  size?: "default" | "hero";
}

export function KpiRow({ items, size = "default" }: KpiRowProps) {
  return (
    <div
      className={cn(
        "grid gap-1.5",
        items.length === 2 && "grid-cols-2",
        items.length >= 3 && "grid-cols-3"
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-muted/50 flex flex-col items-center rounded-md px-1.5 py-2 text-center"
        >
          <span
            className={cn(
              "font-bold tabular-nums",
              size === "hero" ? "text-lg" : "text-sm",
              item.color ?? "text-foreground"
            )}
          >
            {typeof item.value === "number" ? item.value.toLocaleString("pl-PL") : item.value}
          </span>
          <span className="text-muted-foreground text-[10px] leading-tight">{item.label}</span>
          {item.trend && (
            <span
              className={cn(
                "text-[9px] font-medium",
                item.trend.positive ? "text-emerald-500" : "text-red-500"
              )}
            >
              {item.trend.positive ? "↑" : "↓"}
              {Math.abs(item.trend.value)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
