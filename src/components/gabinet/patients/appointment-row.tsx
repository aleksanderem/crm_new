import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/lib/ez-icons";
import type { TFunction } from "i18next";
import type { MappedGabinetAppointment } from "@/lib/supabase/mappers/gabinet/appointments";
import { appointmentStatusBadgeClass } from "@/lib/gabinet-appointment-status";

interface TreatmentParamValue {
  name: string;
  type: string;
  value: string | number | boolean;
  unit?: string;
}

function formatParamValue(p: TreatmentParamValue, t: TFunction): string {
  if (p.type === "checkbox") {
    return p.value ? t("common.yes") : t("common.no");
  }
  const val = String(p.value);
  return p.unit ? `${val} ${p.unit}` : val;
}

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
  t: TFunction;
}) {
  const params = useMemo<TreatmentParamValue[]>(() => {
    if (!apt.treatmentParameterValues) return [];
    try {
      const parsed = JSON.parse(apt.treatmentParameterValues) as TreatmentParamValue[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((p) =>
        p.type === "checkbox" ? true : p.value !== "" && p.value != null,
      );
    } catch {
      return [];
    }
  }, [apt.treatmentParameterValues]);

  return (
    <div
      key={apt._id}
      className={`rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors${isPast ? " opacity-60" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
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
      {params.length > 0 && (
        <div className="mt-2 pt-2 border-t flex flex-wrap gap-x-3 gap-y-1">
          {params.map((p, i) => (
            <span key={i} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">{p.name}:</span>{" "}
              {formatParamValue(p, t)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
