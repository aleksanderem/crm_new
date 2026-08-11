import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/lib/ez-icons";
import type { MappedGabinetAppointment } from "@/lib/supabase/mappers/gabinet/appointments";
import { appointmentStatusBadgeClass } from "@/lib/gabinet-appointment-status";

export function AppointmentRow({
  apt,
  visitCount,
  treatmentDisplayName,
  onClick,
  isPast,
  t,
}: {
  apt: MappedGabinetAppointment;
  visitCount: { label: string; title: string } | null;
  treatmentDisplayName: string | undefined;
  onClick: () => void;
  isPast?: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div
      key={apt._id}
      className={`flex items-center gap-4 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors${isPast ? " opacity-60" : ""}`}
      onClick={onClick}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        <Calendar className="h-4 w-4 text-primary" variant="stroke" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-medium truncate">
            {treatmentDisplayName ?? t("common.unknown")}
          </p>
          {visitCount && (
            <Badge
              variant="outline"
              title={visitCount.title}
              className="shrink-0 border-sky-500/40 bg-sky-500/10 px-1.5 py-0 text-[10px] font-semibold tabular-nums text-sky-700 dark:text-sky-300"
            >
              {visitCount.label}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {apt.date} &middot; {apt.startTime}–{apt.endTime}
        </p>
      </div>
      <Badge
        variant="outline"
        className={appointmentStatusBadgeClass(apt.status)}
      >
        {t(`gabinet.appointments.statuses.${apt.status}`)}
      </Badge>
    </div>
  );
}
