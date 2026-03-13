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

const statusDot: Record<ScheduleItem["status"], string> = {
  working: "bg-emerald-500",
  break: "bg-amber-500",
  off: "bg-muted-foreground/40",
};

export function StaffSchedule({ items }: StaffScheduleProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <div key={item.name} className="flex items-center gap-1.5">
          <span
            className={cn(
              "mt-px h-2 w-2 shrink-0 rounded-full",
              statusDot[item.status]
            )}
          />
          <span className="text-foreground min-w-0 flex-1 truncate text-[10px] font-medium">
            {item.name}
          </span>
          <span className="text-muted-foreground shrink-0 text-[9px] tabular-nums">
            {item.startTime}–{item.endTime}
          </span>
        </div>
      ))}
    </div>
  );
}
