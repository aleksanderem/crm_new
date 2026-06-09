export type AppointmentIndicatorKind =
  | "firstVisit"
  | "payment"
  | "count"
  | "paid"
  | "partial"
  | "unpaid"
  | "credit";

export interface AppointmentIndicator {
  kind: AppointmentIndicatorKind;
  label: string;
  title?: string;
}

const INDICATOR_CLASS: Record<AppointmentIndicatorKind, string> = {
  firstVisit: "bg-emerald-500 text-white",
  payment: "bg-amber-500 text-white",
  count: "bg-sky-500 text-white",
  paid: "bg-emerald-600 text-white",
  partial: "bg-amber-500 text-white",
  unpaid: "bg-red-500 text-white",
  credit: "bg-indigo-500 text-white",
};

interface AppointmentIndicatorBadgeProps {
  indicator: AppointmentIndicator;
  /**
   * Ring color override per surface. The calendar card sits on a dark header
   * (`bg-black/30`) and uses `ring-white/60`; the popover header is lighter
   * and looks better with `ring-black/10`.
   */
  ringClass?: string;
}

export function AppointmentIndicatorBadge({
  indicator,
  ringClass = "ring-white/60",
}: AppointmentIndicatorBadgeProps) {
  return (
    <span
      title={indicator.title ?? indicator.label}
      className={`inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-sm px-0.5 text-[9px] font-bold leading-none ring-1 ${ringClass} ${INDICATOR_CLASS[indicator.kind]}`}
    >
      {indicator.label}
    </span>
  );
}
