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
    <div className="flex flex-col gap-1">
      {stages.map((stage, idx) => {
        const pct = (stage.count / maxCount) * 100;
        const conversionRate =
          idx > 0 && stages[idx - 1].count > 0
            ? ((stage.count / stages[idx - 1].count) * 100).toFixed(0)
            : null;

        return (
          <div key={stage.label} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              {/* Colored dot */}
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: `hsl(var(--${stage.color.replace("bg-", "")}))` }}
              />
              <span className="text-foreground min-w-0 flex-1 truncate text-[10px] font-medium">
                {stage.label}
              </span>
              <span className="text-foreground shrink-0 text-[10px] font-semibold tabular-nums">
                {stage.count}
              </span>
              {conversionRate && (
                <span className="text-muted-foreground shrink-0 text-[8px] tabular-nums">
                  {conversionRate}%
                </span>
              )}
            </div>
            {/* Funnel bar — width narrows with each stage */}
            <div className="ml-3.5 h-1.5 overflow-hidden rounded-full bg-transparent">
              <div
                className={cn("h-full rounded-full transition-all", stage.color)}
                style={{ width: `${pct}%`, opacity: 1 - idx * 0.08 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
