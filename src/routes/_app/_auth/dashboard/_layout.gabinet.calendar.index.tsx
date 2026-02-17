import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "@/lib/ez-icons";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/calendar/"
)({
  component: GabinetCalendarPage,
});

// --- Helpers ---

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function formatTimeShort(t: string): string {
  return t.slice(0, 5);
}

const HOUR_HEIGHT = 60;
const START_HOUR = 7;
const END_HOUR = 21;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR);

function timeToOffset(minutes: number): number {
  return ((minutes / 60) - START_HOUR) * HOUR_HEIGHT;
}

const statusColors: Record<string, string> = {
  scheduled: "bg-indigo-100 text-indigo-700 border-indigo-300",
  confirmed: "bg-blue-100 text-blue-700 border-blue-300",
  in_progress: "bg-amber-100 text-amber-700 border-amber-300",
  completed: "bg-green-100 text-green-700 border-green-300",
  cancelled: "bg-red-100 text-red-700 border-red-300",
  no_show: "bg-gray-100 text-gray-500 border-gray-300",
};

// --- Main component ---

function GabinetCalendarPage() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const weekStart = useMemo(() => getMonday(currentDate), [currentDate]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  // Date range for the week query
  const startDateStr = formatDateStr(weekStart);
  const endDateStr = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return formatDateStr(end);
  }, [weekStart]);

  // Fetch appointments for the week
  const { data: weekAppointments } = useQuery(
    convexQuery(api["gabinet/appointments"].listByDateRange, {
      organizationId,
      startDate: startDateStr,
      endDate: endDateStr,
    })
  );

  // Fetch appointments for the selected day (for right panel)
  const selectedDateStr = formatDateStr(selectedDate);
  const { data: dayAppointments } = useQuery(
    convexQuery(api["gabinet/appointments"].listByDate, {
      organizationId,
      date: selectedDateStr,
    })
  );

  // Fetch patient & treatment data for the day panel
  const { data: patients } = useQuery(
    convexQuery(api["gabinet/patients"].list, {
      organizationId,
      paginationOpts: { numItems: 200, cursor: null },
    })
  );

  const { data: treatments } = useQuery(
    convexQuery(api["gabinet/treatments"].list, {
      organizationId,
      paginationOpts: { numItems: 200, cursor: null },
    })
  );

  const patientMap = useMemo(() => {
    const map = new Map<string, string>();
    if (patients?.page) {
      for (const p of patients.page) {
        map.set(p._id, `${p.firstName} ${p.lastName}`);
      }
    }
    return map;
  }, [patients]);

  const treatmentMap = useMemo(() => {
    const map = new Map<string, string>();
    if (treatments?.page) {
      for (const t of treatments.page) {
        map.set(t._id, t.name);
      }
    }
    return map;
  }, [treatments]);

  // Navigation
  const navigateWeek = (dir: number) => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + dir * 7);
      return d;
    });
  };

  const goToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  // Group week appointments by date
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, typeof weekAppointments>();
    if (weekAppointments) {
      for (const appt of weekAppointments) {
        const existing = map.get(appt.date) ?? [];
        existing.push(appt);
        map.set(appt.date, existing);
      }
    }
    return map;
  }, [weekAppointments]);

  // Sort day appointments by start time
  const sortedDayAppointments = useMemo(() => {
    if (!dayAppointments) return [];
    return [...dayAppointments].sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
  }, [dayAppointments]);

  const today = formatDateStr(new Date());
  const selectedStr = formatDateStr(selectedDate);

  const weekTitle = useMemo(() => {
    const locale = i18n.language;
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return `${weekStart.toLocaleDateString(locale, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}`;
  }, [weekStart, i18n.language]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigateWeek(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            {t("gabinet.calendar.today", "Dziś")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigateWeek(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="ml-2 text-sm font-semibold">{weekTitle}</h2>
        </div>
      </div>

      {/* Main split layout: Calendar left, Day detail right */}
      <div className="flex flex-1 overflow-hidden">
        {/* Calendar grid (left) */}
        <div className="flex flex-1 overflow-y-auto">
          {/* Time gutter */}
          <div className="sticky left-0 z-10 w-14 shrink-0 border-r bg-background pt-10">
            {HOURS.map((h) => (
              <div key={h} className="flex h-[60px] items-start justify-end pr-2">
                <span className="text-xs text-muted-foreground">
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day) => {
            const dayStr = formatDateStr(day);
            const isToday = dayStr === today;
            const isSelected = dayStr === selectedStr;
            const dayAppts = appointmentsByDate.get(dayStr) ?? [];

            return (
              <div
                key={dayStr}
                className={cn(
                  "flex flex-1 flex-col border-r last:border-r-0 cursor-pointer",
                  isSelected && "bg-primary/5"
                )}
                onClick={() => setSelectedDate(new Date(day))}
              >
                {/* Day header */}
                <div
                  className={cn(
                    "sticky top-0 z-10 border-b bg-background px-1 py-1.5 text-center text-xs",
                    isToday && "font-bold",
                    isSelected && "bg-primary/10"
                  )}
                >
                  <div className="text-muted-foreground">
                    {day.toLocaleDateString(i18n.language, { weekday: "short" })}
                  </div>
                  <div className={cn(
                    isToday && "inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground",
                    isSelected && !isToday && "inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary text-primary"
                  )}>
                    {day.getDate()}
                  </div>
                </div>

                {/* Time grid with appointments */}
                <div className="relative flex-1" style={{ minHeight: HOURS.length * HOUR_HEIGHT }}>
                  {HOURS.map((h) => (
                    <div key={h} className="h-[60px] border-b border-dashed border-muted" />
                  ))}

                  {/* Current time line */}
                  {isToday && (() => {
                    const now = new Date();
                    const mins = now.getHours() * 60 + now.getMinutes();
                    const top = timeToOffset(mins);
                    if (top < 0 || top > HOURS.length * HOUR_HEIGHT) return null;
                    return (
                      <div
                        className="pointer-events-none absolute z-20 border-t-2 border-red-500"
                        style={{ top: `${top}px`, left: 0, right: 0 }}
                      >
                        <div className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
                      </div>
                    );
                  })()}

                  {/* Appointment blocks */}
                  {dayAppts.map((appt) => {
                    const startMins = parseTime(appt.startTime);
                    const endMins = parseTime(appt.endTime);
                    const top = timeToOffset(startMins);
                    const height = Math.max(((endMins - startMins) / 60) * HOUR_HEIGHT, 18);
                    const colorClass = statusColors[appt.status] ?? statusColors.scheduled;
                    const patientName = patientMap.get(appt.patientId) ?? "";

                    return (
                      <div
                        key={appt._id}
                        className={cn(
                          "absolute left-0.5 right-0.5 rounded border-l-3 px-1 py-0.5 text-xs overflow-hidden cursor-pointer hover:opacity-80 transition-opacity",
                          colorClass
                        )}
                        style={{ top: `${top}px`, height: `${height}px`, zIndex: 10 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDate(new Date(day));
                        }}
                      >
                        <div className="truncate font-medium">{patientName}</div>
                        {height > 30 && (
                          <div className="truncate opacity-75">
                            {treatmentMap.get(appt.treatmentId) ?? ""}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected day detail panel (right) */}
        <div className="w-80 shrink-0 border-l bg-background overflow-y-auto max-lg:hidden">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">
              {selectedDate.toLocaleDateString(i18n.language, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </h3>
            <p className="text-xs text-muted-foreground">
              {sortedDayAppointments.length}{" "}
              {t("gabinet.calendar.appointments", "wizyt")}
            </p>
          </div>

          {sortedDayAppointments.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("gabinet.calendar.noAppointments", "Brak wizyt w tym dniu")}
            </div>
          ) : (
            <div className="divide-y">
              {sortedDayAppointments.map((appt) => {
                const patientName = patientMap.get(appt.patientId) ?? t("common.unknown", "Nieznany");
                const treatmentName = treatmentMap.get(appt.treatmentId) ?? "";
                const statusClass = statusColors[appt.status] ?? "";

                return (
                  <div key={appt._id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">
                            {formatTimeShort(appt.startTime)}–{formatTimeShort(appt.endTime)}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-sm font-medium">
                          {patientName}
                        </div>
                        {treatmentName && (
                          <div className="truncate text-xs text-muted-foreground">
                            {treatmentName}
                          </div>
                        )}
                        {appt.notes && (
                          <div className="mt-1 truncate text-xs text-muted-foreground italic">
                            {appt.notes}
                          </div>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("shrink-0 text-[10px]", statusClass)}
                      >
                        {t(`gabinet.appointments.status.${appt.status}`, appt.status)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
