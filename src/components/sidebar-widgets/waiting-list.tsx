import { cn } from "@/utils/misc";

export interface WaitingItem {
  label: string;
  subtitle?: string;
  daysWaiting: number;
}

interface WaitingListProps {
  items: WaitingItem[];
}

export function WaitingList({ items }: WaitingListProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-[10px] font-medium leading-tight">
              {item.label}
            </p>
            {item.subtitle && (
              <p className="text-muted-foreground truncate text-[9px] leading-tight">
                {item.subtitle}
              </p>
            )}
          </div>
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium tabular-nums",
              item.daysWaiting >= 3
                ? "bg-red-500/15 text-red-600 dark:text-red-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            )}
          >
            {item.daysWaiting}d
          </span>
        </div>
      ))}
    </div>
  );
}
