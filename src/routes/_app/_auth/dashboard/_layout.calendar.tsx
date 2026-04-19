import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useWideContent } from "@/hooks/use-wide-content";
import { useMutation, useAction } from "convex/react";
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
  RefreshCcw,
} from "@/lib/ez-icons";
import { AlertTriangle } from "lucide-react";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { useState, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Id } from "@cvx/_generated/dataModel";
import { Loader2 } from "lucide-react";

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
  location?: string;
  meetingUrl?: string;
  description?: string;
  googleEventId?: string;
  googleCalendarId?: string;
  moduleRef?: { moduleId: string; entityType: string; entityId: string };
  metadata: Record<string, unknown>;
  requiresCompletion?: boolean;
  _isBusyOnly?: boolean;
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

function isFromGoogle(ev: CalendarEvent): boolean {
  return !!ev.googleEventId;
}

function isBusyOnly(ev: CalendarEvent): boolean {
  return ev._isBusyOnly === true;
}

// --- Event colors ---

function getEventColor(ev: CalendarEvent): {
  bg: string;
  border: string;
  text: string;
} {
  // Busy-only events always get gray styling
  if (isBusyOnly(ev))
    return { bg: "bg-gray-100 dark:bg-gray-800", border: "border-gray-300 dark:border-gray-600", text: "text-gray-500 dark:text-gray-400" };
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
  if (isFromGoogle(ev))
    return { bg: "bg-emerald-50", border: "border-emerald-400", text: "text-emerald-800" };
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

  // Indicate this page has wide content (hides Column 2 on 1024-1400px screens)
  useWideContent(true);

  const [view, setView] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>(
    (search.filter as ModuleFilter) || "all"
  );
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );

  // Google Calendar import
  const { data: googleConnection } = useQuery(
    convexQuery(api.oauthConnections.getByProvider, {
      organizationId,
      provider: "google",
    })
  );
  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  const importGoogleCalendar = useAction(api.google.calendar.importFromGoogle);
  const [isImporting, setIsImporting] = useState(false);

  const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
  const convexSiteUrl = convexUrl.replace(".cloud", ".site");

  const handleGoogleImport = async () => {
    if (!user?._id) return;
    setIsImporting(true);
    try {
      const result = await importGoogleCalendar({
        organizationId,
        ownerId: user._id,
      });
      toast.success(
        t("calendar.googleImportSuccess", {
          defaultValue: "Zaimportowano {{imported}} wydarzeń, zaktualizowano {{updated}}",
          imported: result.imported,
          updated: result.updated,
        })
      );
    } catch (e: any) {
      toast.error(e.message ?? t("calendar.googleImportFailed", "Import failed"));
    } finally {
      setIsImporting(false);
    }
  };

  const handleConnectGoogle = () => {
    if (!user?._id) return;
    const url = `${convexSiteUrl}/google/oauth/initiate?organizationId=${organizationId}&userId=${user._id}`;
    window.location.href = url;
  };

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
    convexQuery(api.scheduledActivities.listForCalendarWithVisibility, {
      organizationId,
      startDate: startTs,
      endDate: endTs,
      moduleFilter: moduleFilter === "all" ? undefined : moduleFilter,
    })
  );

  const updateActivity = useAction(api.scheduledActivities.update);
  const updateAppointment = useMutation(
    api.gabinet.appointments.update
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

  // Sidebar dispatch handlers
  useSidebarDispatch("goToToday", goToday);

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
            <ChevronLeft className="h-4 w-4" variant="stroke" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            {t("gabinet.calendar.today", "Today")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" variant="stroke" />
          </Button>
          <h2 className="ml-2 text-sm font-semibold">{title}</h2>
        </div>

        <div className="flex items-center gap-2">
          {googleConnection ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGoogleImport}
              disabled={isImporting}
            >
              {isImporting ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-3.5 w-3.5" variant="stroke" />
              )}
              {t("calendar.syncGoogle", "Sync Google")}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleConnectGoogle}>
              {t("calendar.connectGoogle", "Connect Google")}
            </Button>
          )}

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

        <div className="space-y-1.5 text-sm text-muted-foreground">
          <p>
            {start.toLocaleDateString()} {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {end && ` – ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </p>
          <p>{t("calendar.type", "Type")}: {event.activityType}</p>
          {isGab && event.metadata.patientName ? (
            <p>{t("gabinet.appointments.patient", "Patient")}: {String(event.metadata.patientName)}</p>
          ) : null}
          {isGab && event.metadata.treatmentName ? (
            <p>{t("gabinet.appointments.treatment", "Treatment")}: {String(event.metadata.treatmentName)}</p>
          ) : null}
          {isGab && event.metadata.status ? (
            <p>{t("common.status", "Status")}: {String(event.metadata.status)}</p>
          ) : null}
          {event.description && (
            <div className="rounded bg-muted/50 p-2 text-xs">
              {event.description}
            </div>
          )}
          {event.location && (
            <p>{t("calendar.location", "Lokalizacja")}: {event.location}</p>
          )}
          {event.meetingUrl && (
            <p>
              <a
                href={event.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                {event.meetingUrl.includes("meet.google")
                  ? "Google Meet"
                  : t("calendar.joinMeeting", "Dołącz do spotkania")}
                <span className="text-xs">↗</span>
              </a>
            </p>
          )}
          {event.isCompleted && (
            <p className="font-medium text-green-600">{t("calendar.completed", "Completed")}</p>
          )}
          {event.requiresCompletion && (
            <div className="mt-2">
              <Button
                variant="outline"
                size="sm"
                className="border-amber-500 text-amber-600 hover:bg-amber-50"
              >
                {t("googleCalendar.calendar.completeButton")}
              </Button>
            </div>
          )}
          <div className="mt-2 flex items-center gap-1.5">
            <span className={`inline-block rounded px-2 py-0.5 text-xs ${colors.bg} ${colors.text}`}>
              {isGab ? "Gabinet" : "CRM"}
            </span>
            {isFromGoogle(event) && (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09a6.97 6.97 0 0 1 0-4.17V7.07H2.18a11.01 11.01 0 0 0 0 9.86l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.7 0 3.99 2.47 2.18 6.07l3.66 2.84c.87-2.6 3.3-4.16 6.16-4.16z" fill="#EA4335"/>
                </svg>
                Google
              </span>
            )}
          </div>
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
          <div className="absolute -left-1 -top-1.5 h-4 w-4 rounded-full bg-red-500" />
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

        const busy = isBusyOnly(ev);

        return (
          <div
            key={ev._id}
            className={`absolute rounded border-l-3 px-1 py-0.5 text-xs transition-opacity ${busy ? "cursor-default" : "cursor-pointer hover:opacity-80"} ${colors.bg} ${colors.border} ${colors.text} ${laid.column > 0 ? "shadow-md" : ""}`}
            style={{
              top: `${top}px`,
              height: `${height}px`,
              left: compact ? `${leftPct}%` : `calc(56px + ${leftPct}%)`,
              right: "2px",
              zIndex: 10 + laid.column,
            }}
            draggable={canDrag && !busy}
            onDragStart={(e) => {
              if (busy) { e.preventDefault(); return; }
              e.dataTransfer.setData(
                "application/calendar-event",
                JSON.stringify({ eventId: ev._id, durationMs })
              );
              e.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => { if (!busy) onEventClick(ev); }}
          >
            <div className="flex items-center gap-1 truncate font-medium">
              {ev.requiresCompletion && (
                <AlertTriangle className="size-3 text-amber-500 shrink-0" />
              )}
              {isFromGoogle(ev) && !busy && (
                <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm bg-white/60 text-[8px] font-bold leading-none">G</span>
              )}
              <span className="truncate">
                {isGabinet(ev) ? (ev.metadata.patientName as string) ?? ev.title : ev.title}
              </span>
            </div>
            {height > 30 && !busy && (
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
                      ? "inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold"
                      : ""
                  }`}
                >
                  {day.getDate()}
                </div>
                {dayEvs.slice(0, 3).map((ev) => {
                  const colors = getEventColor(ev);
                  const busy = isBusyOnly(ev);
                  return (
                    <div
                      key={ev._id}
                      className={`mb-0.5 flex items-center gap-0.5 truncate rounded px-1 text-[10px] ${busy ? "cursor-default" : ""} ${colors.bg} ${colors.text}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!busy) onEventClick(ev);
                      }}
                    >
                      {ev.requiresCompletion && (
                        <AlertTriangle className="size-2.5 text-amber-500 shrink-0" />
                      )}
                      {isFromGoogle(ev) && !busy && (
                        <span className="shrink-0 text-[8px] font-bold opacity-60">G</span>
                      )}
                      <span className="truncate">
                        {isGabinet(ev)
                          ? (ev.metadata.patientName as string) ?? ev.title
                          : ev.title}
                      </span>
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
