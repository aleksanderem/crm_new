import { cn } from "@/lib/utils";

export type AppointmentIndicatorKind = "firstVisit" | "payment" | "count";

export interface AppointmentIndicator {
  kind: AppointmentIndicatorKind;
  label: string;
  title?: string;
}

const INDICATOR_CLASS: Record<AppointmentIndicatorKind, string> = {
  firstVisit: "bg-emerald-500 text-white",
  payment: "bg-amber-500 text-white",
  count: "bg-sky-500 text-white",
};

interface AppointmentIndicatorBadgeProps {
  indicator: AppointmentIndicator;
  /** Extra classes — typically used to switch the ring color between the dark
   * calendar card header (ring-white/60) and lighter surfaces like the preview
   * popover (ring-black/10). */
  className?: string;
}

export function AppointmentIndicatorBadge({
  indicator,
  className,
}: AppointmentIndicatorBadgeProps) {
  return (
    <span
      title={indicator.title ?? indicator.label}
      className={cn(
        "inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-sm px-0.5 text-[9px] font-bold leading-none ring-1",
        INDICATOR_CLASS[indicator.kind],
        className,
      )}
    >
      {indicator.label}
    </span>
  );
}
