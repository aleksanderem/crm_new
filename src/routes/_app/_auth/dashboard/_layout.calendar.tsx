import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { usePermission } from "@/hooks/use-permission";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
} from "@/lib/ez-icons";
import { useState, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/calendar"
)({
  component: UnifiedCalendarPage,
  validateSearch: (search: Record<string, unknown>) => ({
    filter: (search.filter as string) ?? "all",
  }),
});

type ViewMode = "day" | "week" | "month";
type ModuleFilter = "all" | "gabinet" | "crm";

interface CalendarEvent {
  _id: string;
  title: string;
  activityType: string;
  dueDate: number;
  endDate?: number;
  isCompleted: boolean;
  moduleRef?: { moduleId: string; entityType: string; entityId: string };
  metadata: Record<string, unknown>;
}

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

function dateToHourMin(ts: number): { hour: number; min: number } {
  const d = new Date(ts);
  return { hour: d.getHours(), min: d.getMinutes() };
}

function snapTo15(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

const HOUR_HEIGHT = 60; // px per hour
const START_HOUR = 7;
const END_HOUR = 21;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR);

function timeToOffset(hour: number, min: number): number {
  return (hour - START_HOUR) * HOUR_HEIGHT + (min / 60) * HOUR_HEIGHT;
}

function isGabinet(ev: CalendarEvent): boolean {
  return ev.moduleRef?.moduleId === "gabinet";
}

// --- Event colors ---

function getEventColor(ev: CalendarEvent): {
  bg: string;
  border: string;
  text: string;
} {
  if (isGabinet(ev)) {
    const status = ev.metadata.status as string | undefined;
    if (status === "cancelled")
      return { bg: "bg-red-50", border: "border-red-300", text: "text-red-600" };
    if (status === "completed")
      return { bg: "bg-gray-100", border: "border-gray-300", text: "text-gray-500" };
    return { bg: "bg-indigo-50", border: "border-indigo-400", text: "text-indigo-800" };
  }
  if (ev.isCompleted)
    return { bg: "bg-gray-100", border: "border-gray-300", text: "text-gray-500" };
  return { bg: "bg-sky-50", border: "border-sky-400", text: "text-sky-800" };
}

// --- Layout overlapping events (same algorithm as day view) ---

interface LayoutedEvent {
  event: CalendarEvent;
  column: number;
  totalColumns: number;
}

function layoutEvents(events: CalendarEvent[]): LayoutedEvent[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => a.dueDate - b.dueDate);

  const clusters: CalendarEvent[][] = [];
  let clusterEnd = 0;
  let current: CalendarEvent[] = [];

  for (const ev of sorted) {
    const evEnd = ev.endDate ?? ev.dueDate + 30 * 60 * 1000;
    if (current.length === 0 || ev.dueDate < clusterEnd) {
      current.push(ev);
      if (evEnd > clusterEnd) clusterEnd = evEnd;
    } else {
      clusters.push(current);
      current = [ev];
      clusterEnd = evEnd;
    }
  }
  if (current.length > 0) clusters.push(current);

  const result: LayoutedEvent[] = [];
  for (const cluster of clusters) {
    const columns: number[] = [];
    const assignments: { event: CalendarEvent; column: number }[] = [];
    for (const ev of cluster) {
      const evEnd = ev.endDate ?? ev.dueDate + 30 * 60 * 1000;
      let col = -1;
      for (let i = 0; i < columns.length; i++) {
        if (ev.dueDate >= columns[i]) {
          col = i;
          break;
        }
      }
      if (col === -1) {
        col = columns.length;
        columns.push(evEnd);
      } else {
        columns[col] = evEnd;
      }
      assignments.push({ event: ev, column: col });
    }
    const totalColumns = columns.length;
    for (const a of assignments) {
      result.push({ ...a, totalColumns });
    }
  }
  return result;
}

// --- Main component ---

function UnifiedCalendarPage() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const search = useSearch({ from: Route.id });
  const editPerm = usePermission("activities", "edit");

  const [view, setView] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>(
    (search.filter as ModuleFilter) || "all"
  );
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );

  // Date range for query
  const { startTs, endTs, weekStart } = useMemo(() => {
    const monday = getMonday(currentDate);
    if (view === "day") {
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);
      return { startTs: dayStart.getTime(), endTs: dayEnd.getTime(), weekStart: monday };
    }
    if (view === "week") {
      const end = new Date(monday);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { startTs: monday.getTime(), endTs: end.getTime(), weekStart: monday };
    }
    // month
    const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const last = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return { startTs: first.getTime(), endTs: last.getTime(), weekStart: monday };
  }, [view, currentDate]);

  const { data: events } = useQuery(
    convexQuery(api.scheduledActivities.listForCalendar, {
      organizationId,
      startDate: startTs,
      endDate: endTs,
      moduleFilter: moduleFilter === "all" ? undefined : moduleFilter,
    })
  );

  const updateActivity = useMutation(api.scheduledActivities.update);
  const updateAppointment = useMutation(
    api["gabinet/appointments"].update
  );

  // Navigation
  const navigate = useCallback(
    (dir: number) => {
      setCurrentDate((prev) => {
        const d = new Date(prev);
        if (view === "day") d.setDate(d.getDate() + dir);
        else if (view === "week") d.setDate(d.getDate() + dir * 7);
        else d.setMonth(d.getMonth() + dir);
        return d;
      });
    },
    [view]
  );
  const goToday = useCallback(() => setCurrentDate(new Date()), []);

  const title = useMemo(() => {
    const locale = i18n.language;
    if (view === "day")
      return currentDate.toLocaleDateString(locale, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    if (view === "week") {
      const end = new Date(weekStart);
      end.setDate(end.getDate() + 6);
      return `${weekStart.toLocaleDateString(locale, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return currentDate.toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
    });
  }, [view, currentDate, weekStart, i18n.language]);

  // Drag & drop handler
  const handleDrop = useCallback(
    async (eventId: string, newDueDate: number, newEndDate: number | undefined) => {
      if (!editPerm.allowed) {
        toast.error(t("common.permissionDenied", "Permission denied"));
        return;
      }

      const ev = events?.find((e) => e._id === eventId);
      if (!ev) return;

      try {
        // Update the scheduled activity
        await updateActivity({
          organizationId,
          activityId: eventId as Id<"scheduledActivities">,
          dueDate: newDueDate,
          endDate: newEndDate,
        });

        // If gabinet appointment, also update the appointment record
        if (
          isGabinet(ev) &&
          ev.metadata.appointmentId
        ) {
          const newDate = new Date(newDueDate);
          const dateStr = formatDateStr(newDate);
          const startTime = `${String(newDate.getHours()).padStart(2, "0")}:${String(newDate.getMinutes()).padStart(2, "0")}`;
          let endTime: string | undefined;
          if (newEndDate) {
            const endD = new Date(newEndDate);
            endTime = `${String(endD.getHours()).padStart(2, "0")}:${String(endD.getMinutes()).padStart(2, "0")}`;
          }
          await updateAppointment({
            organizationId,
            appointmentId: ev.metadata.appointmentId as Id<"gabinetAppointments">,
            date: dateStr,
            startTime,
            ...(endTime ? { endTime } : {}),
          });
        }

        toast.success(t("calendar.eventMoved", "Event moved"));
      } catch (err: any) {
        toast.error(err.message ?? t("calendar.moveFailed", "Failed to move event"));
      }
    },
    [editPerm.allowed, events, organizationId, updateActivity, updateAppointment, t]
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            {t("gabinet.calendar.today", "Today")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="ml-2 text-sm font-semibold">{title}</h2>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={moduleFilter}
            onValueChange={(v) => setModuleFilter(v as ModuleFilter)}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all", "All")}</SelectItem>
              <SelectItem value="gabinet">{t("nav.gabinet.title", "Gabinet")}</SelectItem>
              <SelectItem value="crm">{t("nav.crm", "CRM")}</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex rounded-md border">
            {(["day", "week", "month"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {t(`gabinet.calendar.${v}`, v)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar body */}
      <div className="flex-1 overflow-hidden">
        {view === "day" && (
          <DayColumn
            date={currentDate}
            events={events ?? []}
            canDrag={editPerm.allowed}
            onDrop={handleDrop}
            onEventClick={setSelectedEvent}
          />
        )}
        {view === "week" && (
          <WeekView
            weekStart={weekStart}
            events={events ?? []}
            canDrag={editPerm.allowed}
            onDrop={handleDrop}
            onEventClick={setSelectedEvent}
          />
        )}
        {view === "month" && (
          <MonthView
            year={currentDate.getFullYear()}
            month={currentDate.getMonth()}
            events={events ?? []}
            onEventClick={setSelectedEvent}
            onDayClick={(d) => {
              setCurrentDate(d);
              setView("day");
            }}
          />
        )}
      </div>

      {/* Event detail panel */}
      {selectedEvent && (
        <EventDetailPanel
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

// --- Event Detail Panel (simple overlay) ---

function EventDetailPanel({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const colors = getEventColor(event);
  const start = new Date(event.dueDate);
  const end = event.endDate ? new Date(event.endDate) : null;
  const isGab = isGabinet(event);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className={`w-96 rounded-lg border bg-background p-5 shadow-xl ${colors.border}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <h3 className="text-base font-semibold">{event.title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            &times;
          </button>
        </div>

        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            {start.toLocaleDateString()} {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {end && ` – ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </p>
          <p>{t("calendar.type", "Type")}: {event.activityType}</p>
          {isGab && event.metadata.patientName && (
            <p>{t("gabinet.appointments.patient", "Patient")}: {event.metadata.patientName as string}</p>
          )}
          {isGab && event.metadata.treatmentName && (
            <p>{t("gabinet.appointments.treatment", "Treatment")}: {event.metadata.treatmentName as string}</p>
          )}
          {isGab && event.metadata.status && (
            <p>{t("common.status", "Status")}: {event.metadata.status as string}</p>
          )}
          {event.isCompleted && (
            <p className="font-medium text-green-600">{t("calendar.completed", "Completed")}</p>
          )}
          <p className={`mt-2 inline-block rounded px-2 py-0.5 text-xs ${colors.bg} ${colors.text}`}>
            {isGab ? "Gabinet" : "CRM"}
          </p>
        </div>
      </div>
    </div>
  );
}

// --- Week View ---

function WeekView({
  weekStart,
  events,
  canDrag,
  onDrop,
  onEventClick,
}: {
  weekStart: Date;
  events: CalendarEvent[];
  canDrag: boolean;
  onDrop: (id: string, due: number, end: number | undefined) => void;
  onEventClick: (ev: CalendarEvent) => void;
}) {
  const { i18n } = useTranslation();
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  return (
    <div className="flex h-full overflow-y-auto">
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
      {days.map((day) => {
        const dayStr = formatDateStr(day);
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 999);
        const dayEvents = events.filter((e) => {
          const d = new Date(e.dueDate);
          return formatDateStr(d) === dayStr;
        });
        const isToday = dayStr === formatDateStr(new Date());

        return (
          <div key={dayStr} className="flex flex-1 flex-col border-r last:border-r-0">
            {/* Day header */}
            <div
              className={`sticky top-0 z-10 border-b bg-background px-1 py-1.5 text-center text-xs ${
                isToday ? "bg-primary/5 font-bold" : ""
              }`}
            >
              <div className="text-muted-foreground">
                {day.toLocaleDateString(i18n.language, { weekday: "short" })}
              </div>
              <div className={isToday ? "text-primary" : ""}>
                {day.getDate()}
              </div>
            </div>

            {/* Time grid */}
            <DayColumn
              date={day}
              events={dayEvents}
              canDrag={canDrag}
              onDrop={onDrop}
              onEventClick={onEventClick}
              compact
            />
          </div>
        );
      })}
    </div>
  );
}

// --- Day Column (used in both day & week views) ---

function DayColumn({
  date,
  events,
  canDrag,
  onDrop,
  onEventClick,
  compact = false,
}: {
  date: Date;
  events: CalendarEvent[];
  canDrag: boolean;
  onDrop: (id: string, due: number, end: number | undefined) => void;
  onEventClick: (ev: CalendarEvent) => void;
  compact?: boolean;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const isToday = formatDateStr(date) === formatDateStr(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentLineTop = timeToOffset(now.getHours(), now.getMinutes());

  const layouts = useMemo(() => layoutEvents(events), [events]);

  // Drag over handler — compute drop time from mouse Y
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop2 = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const data = e.dataTransfer.getData("application/calendar-event");
      if (!data) return;
      const { eventId, durationMs } = JSON.parse(data);

      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) return;
      const y = e.clientY - rect.top + (gridRef.current?.scrollTop ?? 0);
      const totalMinutes = START_HOUR * 60 + (y / HOUR_HEIGHT) * 60;
      const snapped = snapTo15(totalMinutes);
      const hour = Math.floor(snapped / 60);
      const min = snapped % 60;

      const newDue = new Date(date);
      newDue.setHours(hour, min, 0, 0);
      const newEnd = durationMs ? newDue.getTime() + durationMs : undefined;

      onDrop(eventId, newDue.getTime(), newEnd);
    },
    [date, onDrop]
  );

  return (
    <div
      ref={gridRef}
      className={`relative flex-1 ${compact ? "" : "overflow-y-auto"}`}
      style={{ minHeight: HOURS.length * HOUR_HEIGHT }}
      onDragOver={handleDragOver}
      onDrop={handleDrop2}
    >
      {/* Hour grid lines */}
      {!compact &&
        HOURS.map((h) => (
          <div key={h} className="flex">
            <div className="sticky left-0 z-10 w-14 shrink-0 border-r bg-background">
              <div className="flex h-[60px] items-start justify-end pr-2">
                <span className="text-xs text-muted-foreground">
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            </div>
            <div className="h-[60px] flex-1 border-b border-dashed border-muted" />
          </div>
        ))}
      {compact &&
        HOURS.map((h) => (
          <div
            key={h}
            className="h-[60px] border-b border-dashed border-muted"
          />
        ))}

      {/* Current time line */}
      {isToday && currentLineTop > 0 && currentLineTop < HOURS.length * HOUR_HEIGHT && (
        <div
          className="pointer-events-none absolute z-20 border-t-2 border-red-500"
          style={{ top: `${currentLineTop}px`, left: compact ? 0 : 56, right: 0 }}
        >
          <div className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
        </div>
      )}

      {/* Event blocks */}
      {layouts.map((laid) => {
        const ev = laid.event;
        const { hour, min } = dateToHourMin(ev.dueDate);
        const top = timeToOffset(hour, min);
        const endTs = ev.endDate ?? ev.dueDate + 30 * 60 * 1000;
        const { hour: eh, min: em } = dateToHourMin(endTs);
        const bottom = timeToOffset(eh, em);
        const height = Math.max(bottom - top, 18);

        const colors = getEventColor(ev);
        const step = Math.min(32, Math.floor(85 / laid.totalColumns));
        const leftPct = laid.column * step;

        const durationMs = endTs - ev.dueDate;

        return (
          <div
            key={ev._id}
            className={`absolute cursor-pointer rounded border-l-3 px-1 py-0.5 text-xs transition-opacity hover:opacity-80 ${colors.bg} ${colors.border} ${colors.text} ${laid.column > 0 ? "shadow-md" : ""}`}
            style={{
              top: `${top}px`,
              height: `${height}px`,
              left: compact ? `${leftPct}%` : `calc(56px + ${leftPct}%)`,
              right: "2px",
              zIndex: 10 + laid.column,
            }}
            draggable={canDrag}
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/calendar-event",
                JSON.stringify({ eventId: ev._id, durationMs })
              );
              e.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => onEventClick(ev)}
          >
            <div className="truncate font-medium">
              {isGabinet(ev) ? (ev.metadata.patientName as string) ?? ev.title : ev.title}
            </div>
            {height > 30 && (
              <div className="truncate opacity-75">
                {isGabinet(ev) ? (ev.metadata.treatmentName as string) : ev.activityType}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Month View ---

function MonthView({
  year,
  month,
  events,
  onEventClick,
  onDayClick,
}: {
  year: number;
  month: number;
  events: CalendarEvent[];
  onEventClick: (ev: CalendarEvent) => void;
  onDayClick: (d: Date) => void;
}) {
  const { i18n } = useTranslation();
  const today = formatDateStr(new Date());

  const weeks = useMemo(() => {
    const first = new Date(year, month, 1);
    const dayOfWeek = first.getDay();
    const start = new Date(first);
    start.setDate(start.getDate() - ((dayOfWeek + 6) % 7)); // Monday start

    const result: Date[][] = [];
    const d = new Date(start);
    for (let w = 0; w < 6; w++) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
      result.push(week);
      // Stop if we've gone past the month
      if (d.getMonth() !== month && w >= 3) break;
    }
    return result;
  }, [year, month]);

  // Group events by date string
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const ds = formatDateStr(new Date(ev.dueDate));
      const arr = map.get(ds) ?? [];
      arr.push(ev);
      map.set(ds, arr);
    }
    return map;
  }, [events]);

  const weekdayLabels = useMemo(() => {
    const d = new Date(2024, 0, 1); // Monday
    return Array.from({ length: 7 }, (_, i) => {
      d.setDate(1 + i);
      const wd = (d.getDay() + 6) % 7;
      const target = new Date(2024, 0, 1 + i);
      // Use a known Monday
      const mon = new Date(2024, 0, 1); // 2024-01-01 is Monday
      const label = new Date(mon);
      label.setDate(label.getDate() + i);
      return label.toLocaleDateString(i18n.language, { weekday: "short" });
    });
  }, [i18n.language]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Weekday headers */}
      <div className="sticky top-0 z-10 grid grid-cols-7 border-b bg-background">
        {weekdayLabels.map((label, i) => (
          <div key={i} className="px-2 py-1 text-center text-xs font-medium text-muted-foreground">
            {label}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid flex-1 grid-cols-7 border-b">
          {week.map((day) => {
            const ds = formatDateStr(day);
            const isCurrentMonth = day.getMonth() === month;
            const isToday = ds === today;
            const dayEvs = eventsByDate.get(ds) ?? [];

            return (
              <div
                key={ds}
                className={`min-h-[80px] cursor-pointer border-r p-1 last:border-r-0 hover:bg-muted/30 ${
                  !isCurrentMonth ? "bg-muted/10 text-muted-foreground/50" : ""
                }`}
                onClick={() => onDayClick(day)}
              >
                <div
                  className={`mb-0.5 text-xs ${
                    isToday
                      ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold"
                      : ""
                  }`}
                >
                  {day.getDate()}
                </div>
                {dayEvs.slice(0, 3).map((ev) => {
                  const colors = getEventColor(ev);
                  return (
                    <div
                      key={ev._id}
                      className={`mb-0.5 truncate rounded px-1 text-[10px] ${colors.bg} ${colors.text}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(ev);
                      }}
                    >
                      {isGabinet(ev)
                        ? (ev.metadata.patientName as string) ?? ev.title
                        : ev.title}
                    </div>
                  );
                })}
                {dayEvs.length > 3 && (
                  <div className="text-[10px] text-muted-foreground">
                    +{dayEvs.length - 3} more
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
