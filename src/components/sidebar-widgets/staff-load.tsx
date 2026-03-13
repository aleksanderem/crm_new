import { cn } from "@/utils/misc";

export interface StaffLoadItem {
  name: string;
  appointmentCount: number;
  maxCapacity: number;
}

interface StaffLoadProps {
  staff: StaffLoadItem[];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function StaffLoad({ staff }: StaffLoadProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {staff.map((member) => {
        const pct =
          member.maxCapacity > 0
            ? (member.appointmentCount / member.maxCapacity) * 100
            : 0;
        const barColor =
          pct > 90
            ? "bg-red-500"
            : pct >= 70
              ? "bg-amber-500"
              : "bg-emerald-500";
        const textColor =
          pct > 90
            ? "text-red-600 dark:text-red-400"
            : pct >= 70
              ? "text-amber-600 dark:text-amber-400"
              : "text-emerald-600 dark:text-emerald-400";

        return (
          <div key={member.name} className="flex items-center gap-2">
            {/* Initials avatar */}
            <span className="bg-muted text-muted-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold">
              {getInitials(member.name)}
            </span>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-baseline justify-between">
                <span className="text-foreground truncate text-[10px] font-medium">
                  {member.name}
                </span>
                <span className={cn("shrink-0 text-[9px] font-semibold tabular-nums", textColor)}>
                  {member.appointmentCount}/{member.maxCapacity}
                </span>
              </div>
              <div className="bg-muted/60 h-1.5 overflow-hidden rounded-full">
                <div
                  className={cn("h-full rounded-full transition-all", barColor)}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
