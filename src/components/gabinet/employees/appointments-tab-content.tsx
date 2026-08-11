import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  ClipboardList,
  Plus,
} from "@/lib/ez-icons";
import type { MappedGabinetAppointment } from "@/lib/supabase/mappers/gabinet/appointments";
import { appointmentStatusBadgeClass } from "@/lib/gabinet-appointment-status";

export function AppointmentsTabContent({
  employeeAppointments,
  calendarWeekStart,
  setCalendarWeekStart,
  calendarWeekDates,
  calendarAppointments,
  appointmentsView,
  setAppointmentsView,
  treatmentMap,
  navigate,
  t,
  i18nLanguage,
}: {
  employeeAppointments: MappedGabinetAppointment[] | undefined;
  calendarWeekStart: string;
  setCalendarWeekStart: (v: string) => void;
  calendarWeekDates: string[];
  calendarAppointments: MappedGabinetAppointment[];
  appointmentsView: "calendar" | "list";
  setAppointmentsView: (v: "calendar" | "list") => void;
  treatmentMap: Map<string, string>;
  navigate: (opts: { to: string }) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  i18nLanguage: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {t("gabinet.employees.tabs.appointments")}
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border">
            <Button
              size="sm"
              variant={appointmentsView === "calendar" ? "default" : "ghost"}
              className="rounded-r-none h-8 px-3"
              onClick={() => setAppointmentsView("calendar")}
            >
              <Calendar className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={appointmentsView === "list" ? "default" : "ghost"}
              className="rounded-l-none h-8 px-3"
              onClick={() => setAppointmentsView("list")}
            >
              <ClipboardList className="h-4 w-4" />
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate({ to: "/dashboard/gabinet/calendar" })}
          >
            <Plus className="mr-1 h-4 w-4" variant="stroke" />
            {t("gabinet.appointments.createAppointment")}
          </Button>
        </div>
      </div>

      {!employeeAppointments || employeeAppointments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Calendar className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {t("gabinet.appointments.noAppointments")}
          </p>
        </div>
      ) : appointmentsView === "calendar" ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date(calendarWeekStart + "T00:00:00");
                d.setDate(d.getDate() - 7);
                setCalendarWeekStart(d.toISOString().split("T")[0]);
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {new Date(calendarWeekDates[0] + "T00:00:00").toLocaleDateString(i18nLanguage, { day: "numeric", month: "short" })}
                {" – "}
                {new Date(calendarWeekDates[6] + "T00:00:00").toLocaleDateString(i18nLanguage, { day: "numeric", month: "short", year: "numeric" })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const now = new Date();
                  const day = now.getDay();
                  const diff = day === 0 ? -6 : 1 - day;
                  const monday = new Date(now);
                  monday.setDate(now.getDate() + diff);
                  setCalendarWeekStart(monday.toISOString().split("T")[0]);
                }}
              >
                {t("gabinet.employees.appointmentsView.today")}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date(calendarWeekStart + "T00:00:00");
                d.setDate(d.getDate() + 7);
                setCalendarWeekStart(d.toISOString().split("T")[0]);
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-7 border-b bg-muted/50">
              {calendarWeekDates.map((date) => {
                const d = new Date(date + "T00:00:00");
                const isToday = date === new Date().toISOString().split("T")[0];
                return (
                  <div
                    key={date}
                    className={`px-2 py-2 text-center text-xs font-medium ${isToday ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
                  >
                    <div>{d.toLocaleDateString(i18nLanguage, { weekday: "short" })}</div>
                    <div className={`text-lg ${isToday ? "font-bold" : ""}`}>{d.getDate()}</div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-7 min-h-[300px]">
              {calendarWeekDates.map((date) => {
                const dayApts = calendarAppointments
                  .filter((a) => a.date === date)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime));
                return (
                  <div key={date} className="border-r last:border-r-0 p-1 space-y-1">
                    {dayApts.map((apt) => {
                      const tName = apt.treatmentId ? treatmentMap.get(apt.treatmentId) : undefined;
                      const statusColors: Record<string, string> = {
                        scheduled: "bg-blue-50 border-blue-200 text-blue-800",
                        confirmed: "bg-green-50 border-green-200 text-green-800",
                        in_progress: "bg-yellow-50 border-yellow-200 text-yellow-800",
                        completed: "bg-gray-50 border-gray-200 text-gray-600",
                        cancelled: "bg-red-50 border-red-200 text-red-400",
                        no_show: "bg-orange-50 border-orange-200 text-orange-400",
                      };
                      const cls = statusColors[apt.status] ?? statusColors.scheduled;
                      return (
                        <div
                          key={apt._id}
                          className={`rounded border-l-2 px-1.5 py-1 text-xs cursor-pointer hover:opacity-80 ${cls}`}
                          onClick={() =>
                            navigate({ to: `/dashboard/gabinet/appointments/${apt._id}` })
                          }
                        >
                          <div className="font-medium truncate">{apt.startTime}–{apt.endTime}</div>
                          <div className="truncate opacity-75">{tName ?? t("common.unknown")}</div>
                        </div>
                      );
                    })}
                    {dayApts.length === 0 && (
                      <div className="h-full min-h-[60px]" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {calendarAppointments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              {t("gabinet.employees.appointmentsView.noAppointmentsThisWeek")}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {[...employeeAppointments]
            .sort((a, b) =>
              (b.date + b.startTime).localeCompare(a.date + a.startTime)
            )
            .map((apt) => {
              const treatmentName = apt.treatmentId ? treatmentMap.get(apt.treatmentId) : undefined;
              const isPast = apt.date < new Date().toISOString().split("T")[0];
              return (
                <div
                  key={apt._id}
                  className={`flex items-center gap-4 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors ${isPast ? "opacity-60" : ""}`}
                  onClick={() =>
                    navigate({ to: `/dashboard/gabinet/appointments/${apt._id}` })
                  }
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Calendar className="h-4 w-4 text-primary" variant="stroke" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {treatmentName ?? t("common.unknown")}
                    </p>
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
            })}
        </div>
      )}
    </div>
  );
}
