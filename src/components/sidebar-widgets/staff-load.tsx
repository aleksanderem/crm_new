import { cn } from "@/utils/misc";

export interface StaffLoadItem {
  name: string;
  appointmentCount: number;
  maxCapacity: number;
}

interface StaffLoadProps {
  staff: StaffLoadItem[];
}

export function StaffLoad({ staff }: StaffLoadProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {staff.map((member) => {
        const pct = member.maxCapacity > 0
          ? (member.appointmentCount / member.maxCapacity) * 100
          : 0;
        const barColor =
          pct > 90
            ? "bg-red-500"
            : pct >= 70
            ? "bg-amber-500"
            : "bg-emerald-500";

        return (
          <div key={member.name} className="flex items-center gap-1.5">
            <span className="text-muted-foreground w-16 shrink-0 truncate text-[10px]">
              {member.name}
            </span>
            <div className="bg-muted/50 h-2.5 flex-1 overflow-hidden rounded-full">
              <div
                className={cn("h-full rounded-full transition-all", barColor)}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <span className="text-muted-foreground w-8 text-right text-[9px] tabular-nums">
              {member.appointmentCount}/{member.maxCapacity}
            </span>
          </div>
        );
      })}
    </div>
  );
}
