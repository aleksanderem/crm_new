import { cn } from "@/utils/misc";

export interface SourceSegment {
  label: string;
  count: number;
  color: string;
}

interface SourceBarProps {
  segments: SourceSegment[];
}

export function SourceBar({ segments }: SourceBarProps) {
  const total = segments.reduce((sum, s) => sum + s.count, 0) || 1;

  return (
    <div className="flex flex-col gap-2">
      {/* Stacked bar with rounded caps and segment gaps */}
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={cn("h-full shrink-0 first:rounded-l-full last:rounded-r-full", seg.color)}
            style={{ width: `${(seg.count / total) * 100}%` }}
          />
        ))}
      </div>

      {/* Legend with percentage */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((seg) => {
          const pct = ((seg.count / total) * 100).toFixed(0);
          return (
            <div key={seg.label} className="flex items-center gap-1">
              <span className={cn("h-2 w-2 shrink-0 rounded-sm", seg.color)} />
              <span className="text-muted-foreground text-[9px] truncate">{seg.label}</span>
              <span className="text-foreground text-[9px] font-semibold tabular-nums">
                {seg.count}
              </span>
              <span className="text-muted-foreground text-[8px] tabular-nums">({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
