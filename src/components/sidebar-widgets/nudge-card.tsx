import { cn } from "@/utils/misc";

type NudgeSeverity = "red" | "yellow" | "green";

interface NudgeCardProps {
  message: string;
  severity: NudgeSeverity;
  icon?: string;
}

const severityStyles: Record<NudgeSeverity, string> = {
  red: "bg-red-500/10 border-red-500/30 text-red-500",
  yellow: "bg-amber-500/10 border-amber-500/30 text-amber-500",
  green: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500",
};

export function NudgeCard({ message, severity, icon }: NudgeCardProps) {
  return (
    <div className={cn("rounded-md border px-2.5 py-1.5 text-xs", severityStyles[severity])}>
      {icon && <span className="mr-1">{icon}</span>}
      {message}
    </div>
  );
}
