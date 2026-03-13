import { cn } from "@/utils/misc";

export interface FunnelStage {
  label: string;
  count: number;
  color: string;
}

interface MiniFunnelProps {
  stages: FunnelStage[];
}

export function MiniFunnel({ stages }: MiniFunnelProps) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="flex flex-col gap-1.5">
      {stages.map((stage) => (
        <div key={stage.label} className="flex items-center gap-1.5">
          <span className="text-muted-foreground w-16 shrink-0 truncate text-[10px]">
            {stage.label}
          </span>
          <div className="bg-muted/50 h-2.5 flex-1 overflow-hidden rounded-full">
            <div
              className={cn("h-full rounded-full transition-all", stage.color)}
              style={{ width: `${(stage.count / maxCount) * 100}%` }}
            />
          </div>
          <span className="text-foreground w-5 text-right text-[10px] font-medium tabular-nums">
            {stage.count}
          </span>
        </div>
      ))}
    </div>
  );
}
