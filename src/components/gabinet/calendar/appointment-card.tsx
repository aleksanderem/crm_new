import { appointmentStatusBadgeClass } from "@/lib/gabinet-appointment-status";

export interface AppointmentTag {
  name: string;
  color: string;
}

export type AppointmentIndicatorKind = "firstVisit" | "payment" | "count";

export interface AppointmentIndicator {
  kind: AppointmentIndicatorKind;
  label: string;
  title?: string;
}

interface AppointmentCardProps {
  startTime: string;
  endTime: string;
  patientName: string;
  treatmentName: string;
  status: string;
  color?: string;
  tags?: AppointmentTag[];
  indicators?: AppointmentIndicator[];
  onClick?: () => void;
}

const INDICATOR_CLASS: Record<AppointmentIndicatorKind, string> = {
  firstVisit: "bg-emerald-500 text-white",
  payment: "bg-amber-500 text-white",
  count: "bg-sky-500 text-white",
};

export function AppointmentCard({
  startTime,
  endTime,
  patientName,
  treatmentName,
  status,
  color,
  tags,
  indicators,
  onClick,
}: AppointmentCardProps) {
  const cls = appointmentStatusBadgeClass(status);
  const strike = status === "cancelled" ? " line-through" : "";

  return (
    <button
      onClick={onClick}
      className={`flex w-full h-full flex-col overflow-hidden rounded border-l-4 text-left text-xs transition-opacity hover:opacity-80 ${cls}${strike}`}
      style={color ? { borderLeftColor: color } : undefined}
    >
      <div className="flex items-center justify-between gap-1 bg-black/30 px-2 py-0.5 font-semibold dark:bg-black/50">
        <span className="truncate">{startTime}–{endTime}</span>
        {((tags && tags.length > 0) || (indicators && indicators.length > 0)) && (
          <div className="flex shrink-0 items-center gap-0.5">
            {tags?.map((tag, i) => (
              <span
                key={`tag-${tag.name}-${i}`}
                title={tag.name}
                className="inline-block h-1.5 w-1.5 rounded-full ring-1 ring-white/60"
                style={{ backgroundColor: tag.color }}
              />
            ))}
            {indicators?.map((ind, i) => (
              <span
                key={`ind-${ind.kind}-${i}`}
                title={ind.title ?? ind.label}
                className={`inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-sm px-0.5 text-[9px] font-bold leading-none ring-1 ring-white/60 ${INDICATOR_CLASS[ind.kind]}`}
              >
                {ind.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="px-2 py-1">
        <div className="truncate font-medium">{patientName}</div>
        <div className="truncate opacity-75">{treatmentName}</div>
      </div>
    </button>
  );
}
