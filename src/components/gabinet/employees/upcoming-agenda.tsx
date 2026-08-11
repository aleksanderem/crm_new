import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/lib/ez-icons";
import type { MappedGabinetAppointment } from "@/lib/supabase/mappers/gabinet/appointments";
import { appointmentStatusBadgeClass } from "@/lib/gabinet-appointment-status";

export function UpcomingAgenda({
  appointments,
  treatmentMap,
  navigate,
  t,
  i18nLanguage,
}: {
  appointments: MappedGabinetAppointment[] | undefined;
  treatmentMap: Map<string, string>;
  navigate: (opts: { to: string }) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  i18nLanguage: string;
}) {
  const today = new Date().toISOString().split("T")[0];

  // Filter upcoming (today + future), non-cancelled
  const upcoming = useMemo(() => {
    if (!appointments) return [];
    return appointments
      .filter((a) => a.date >= today && a.status !== "cancelled" && a.status !== "no_show")
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  }, [appointments, today]);

  // Group by date
  const groupedByDay = useMemo(() => {
    const groups = new Map<string, typeof upcoming>();
    for (const apt of upcoming) {
      if (!groups.has(apt.date)) groups.set(apt.date, []);
      groups.get(apt.date)!.push(apt);
    }
    return [...groups.entries()].slice(0, 7); // Show up to 7 days
  }, [upcoming]);

  const formatDayHeader = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    if (dateStr === today) return t("gabinet.employees.agenda.today");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dateStr === tomorrow.toISOString().split("T")[0])
      return t("gabinet.employees.agenda.tomorrow");
    return d.toLocaleDateString(i18nLanguage, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  if (!appointments) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (upcoming.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-1">
          {t("gabinet.employees.agenda.empty")}
        </h3>
        <p className="text-sm text-muted-foreground/70">
          {t("gabinet.employees.agenda.emptyHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {t("gabinet.employees.agenda.title")}
        </h3>
        <Badge variant="outline">
          {t("gabinet.employees.agenda.upcoming", { count: upcoming.length })}
        </Badge>
      </div>

      {groupedByDay.map(([date, dayAppointments]: [string, MappedGabinetAppointment[]]) => {
        const isToday = date === today;
        return (
          <div key={date}>
            <div className={`flex items-center gap-2 mb-3 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
              <div className={`h-2 w-2 rounded-full ${isToday ? "bg-primary" : "bg-muted-foreground/40"}`} />
              <h4 className="text-sm font-semibold uppercase tracking-wide">
                {formatDayHeader(date)}
              </h4>
              <span className="text-xs">
                ({dayAppointments.length})
              </span>
            </div>
            <div className="space-y-2 ml-4">
              {dayAppointments.map((apt) => {
                const treatmentName = apt.treatmentId ? treatmentMap.get(apt.treatmentId) : undefined;
                const durationMin = (() => {
                  const [sh, sm] = apt.startTime.split(":").map(Number);
                  const [eh, em] = apt.endTime.split(":").map(Number);
                  return (eh * 60 + em) - (sh * 60 + sm);
                })();
                return (
                  <div
                    key={apt._id}
                    className="flex items-center gap-4 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() =>
                      navigate({ to: `/dashboard/gabinet/appointments/${apt._id}` })
                    }
                  >
                    <div className="flex flex-col items-center justify-center min-w-[60px] text-center">
                      <span className="text-sm font-bold">{apt.startTime}</span>
                      <span className="text-[10px] text-muted-foreground">{apt.endTime}</span>
                    </div>
                    <div className="h-10 w-0.5 rounded-full bg-primary/30" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {treatmentName ?? t("common.unknown")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {durationMin} {t("gabinet.employees.agenda.minutes")}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs ${appointmentStatusBadgeClass(apt.status)}`}
                    >
                      {t(`gabinet.appointments.statuses.${apt.status}`)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
