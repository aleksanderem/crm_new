import { appointmentStatusBadgeClass } from "@/lib/gabinet-appointment-status";

export interface AppointmentTag {
  name: string;
  color: string;
}

interface AppointmentCardProps {
  startTime: string;
  endTime: string;
  patientName: string;
  treatmentName: string;
  status: string;
  color?: string;
  tags?: AppointmentTag[];
  onClick?: () => void;
}

export function AppointmentCard({
  startTime,
  endTime,
  patientName,
  treatmentName,
  status,
  color,
  tags,
  onClick,
}: AppointmentCardProps) {
  const cls = appointmentStatusBadgeClass(status);
  const strike = status === "cancelled" ? " line-through" : "";

  return (
    <button
      onClick={onClick}
      className={`w-full h-full overflow-hidden rounded border-l-4 px-2 py-1 text-left text-xs transition-opacity hover:opacity-80 ${cls}${strike}`}
      style={color ? { borderLeftColor: color } : undefined}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="font-medium truncate flex-1">{patientName}</div>
        {tags && tags.length > 0 && (
          <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
            {tags.map((tag, i) => (
              <span
                key={`${tag.name}-${i}`}
                title={tag.name}
                className="inline-block h-1.5 w-1.5 rounded-full ring-1 ring-white/60"
                style={{ backgroundColor: tag.color }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="truncate opacity-75">{treatmentName}</div>
      <div className="opacity-60">{startTime}–{endTime}</div>
    </button>
  );
}
