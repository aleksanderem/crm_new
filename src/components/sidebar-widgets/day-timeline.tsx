import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";
import { X } from "@/lib/ez-icons";
import { cn } from "@/utils/misc";
import { useTranslation } from "react-i18next";

interface DayTimelineProps {
  organizationId: Id<"organizations">;
  date: string;
}

export function DayTimeline({ organizationId, date }: DayTimelineProps) {
  const { t, i18n } = useTranslation();
  const { setDayAgendaDate } = useSidebarSlot();
  const agenda = useQuery(api.gabinet.sidebarWidgets.getDayAgenda, {
    organizationId,
    date,
  });

  if (!agenda) return null;

  const locale = i18n.language === "pl" ? "pl-PL" : "en-US";
  const dateObj = new Date(date + "T00:00:00");
  const dayName = dateObj.toLocaleDateString(locale, { weekday: "long" });
  const dateStr = dateObj.toLocaleDateString(locale, { day: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-foreground text-sm font-semibold capitalize">
            {dayName}, {dateStr}
          </div>
          <div className="text-muted-foreground text-[10px]">
            {t("sidebar.gabinet.dayAgendaSummary", {
              total: agenda.totalAppointments,
              unconfirmed: agenda.totalAppointments - agenda.confirmedCount,
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDayAgendaDate(null)}
          className="bg-muted hover:bg-muted/80 rounded p-1"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Timeline */}
      {agenda.appointments.length === 0 ? (
        <div className="text-muted-foreground py-4 text-center text-xs">
          {t("sidebar.gabinet.noAppointments", "Brak wizyt w tym dniu")}
        </div>
      ) : (
        <div className="border-border relative border-l-2 pl-3">
          {agenda.appointments.map((appt) => {
            const isCompleted = appt.status === "completed";
            const isCurrent = appt.status === "in_progress";

            return (
              <div key={appt.id} className="relative mb-2 pb-1">
                <div
                  className={cn(
                    "border-background absolute -left-[17px] top-0.5 h-2 w-2 rounded-full border-2",
                    isCompleted && "bg-emerald-500",
                    isCurrent && "bg-primary ring-primary/30 ring-2",
                    !isCompleted && !isCurrent && "bg-muted-foreground/30",
                  )}
                />
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px]">
                    <span
                      className={cn(
                        "font-medium",
                        isCompleted
                          ? "text-emerald-500"
                          : isCurrent
                            ? "text-primary"
                            : "text-muted-foreground",
                      )}
                    >
                      {isCompleted && "✓ "}
                      {appt.startTime}
                    </span>{" "}
                    <span
                      className={cn(
                        isCurrent ? "text-foreground font-medium" : "text-muted-foreground",
                      )}
                    >
                      {appt.patientName}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-[9px]",
                      !appt.confirmed ? "text-amber-500" : "text-muted-foreground",
                    )}
                  >
                    {appt.treatmentName}{" "}
                    {appt.treatmentDuration > 0 && `${appt.treatmentDuration}min`}
                  </span>
                </div>
                <div className="text-muted-foreground ml-0.5 text-[9px]">
                  {appt.employeeName}
                  {!appt.confirmed && <span className="text-amber-500"> · {t("sidebar.gabinet.unconfirmed")}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick action */}
      <button
        type="button"
        className="bg-primary/10 hover:bg-primary/20 text-primary w-full rounded-md border border-primary/30 px-3 py-1.5 text-center text-xs font-medium transition-colors"
      >
        + {t("sidebar.gabinet.bookAppointment", { date: dateStr })}
      </button>
    </div>
  );
}
