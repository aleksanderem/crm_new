import { cn } from "@/utils/misc";

export interface ScheduleItem {
  name: string;
  startTime: string;
  endTime: string;
  status: "working" | "break" | "off";
}

interface StaffScheduleProps {
  items: ScheduleItem[];
}

const statusConfig: Record<ScheduleItem["status"], { dot: string }> = {
  working: { dot: "bg-emerald-500" },
  break: { dot: "bg-amber-500" },
  off: { dot: "bg-muted-foreground/40" },
};

export function StaffSchedule({ items }: StaffScheduleProps) {
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => {
        const cfg = statusConfig[item.status];

        return (
          <div
            key={item.name}
            className="hover:bg-muted/30 flex items-center gap-2 rounded-md px-1 py-1 transition-colors"
          >
            {/* Status indicator with ping for active */}
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className={cn("absolute h-full w-full rounded-full", cfg.dot)} />
              {item.status === "working" && (
                <span
                  className={cn(
                    "absolute h-full w-full animate-ping rounded-full opacity-30",
                    cfg.dot,
                  )}
                />
              )}
            </span>

            <span className="text-foreground min-w-0 flex-1 truncate text-[10px] font-medium">
              {item.name}
            </span>

            <span className="text-muted-foreground shrink-0 text-[9px] tabular-nums">
              {item.startTime}–{item.endTime}
            </span>
          </div>
        );
      })}
    </div>
  );
}
