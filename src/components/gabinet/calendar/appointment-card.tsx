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

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 border-blue-300 text-blue-800",
  confirmed: "bg-green-100 border-green-300 text-green-800",
  in_progress: "bg-yellow-100 border-yellow-300 text-yellow-800",
  completed: "bg-gray-100 border-gray-300 text-gray-600",
  cancelled: "bg-red-50 border-red-200 text-red-400 line-through",
  no_show: "bg-orange-50 border-orange-200 text-orange-400",
};

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
  const cls = STATUS_COLORS[status] ?? STATUS_COLORS.scheduled;

  return (
    <button
      onClick={onClick}
      className={`w-full h-full overflow-hidden rounded border-l-4 px-2 py-1 text-left text-xs transition-opacity hover:opacity-80 ${cls}`}
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
