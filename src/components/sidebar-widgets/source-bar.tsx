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
      <div className="flex h-3 overflow-hidden rounded-full">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={cn("h-full shrink-0", seg.color)}
            style={{ width: `${(seg.count / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", seg.color)} />
            <span className="text-muted-foreground text-[10px] truncate">
              {seg.label}
            </span>
            <span className="text-foreground text-[10px] font-medium tabular-nums">
              {seg.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
