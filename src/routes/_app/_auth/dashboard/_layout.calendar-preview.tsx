import { useCallback, useEffect, useMemo, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import {
  Calendar,
  CalendarDate,
  type CalendarEvent,
  type CalendarHandle,
} from "@/components/application/calendar/calendar";
import type { EventViewColor } from "@/components/application/calendar/base-components/calendar-month-view-event";
import { useMiniCalendar } from "@/components/layout/mini-calendar-context";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/calendar-preview"
)({
  component: CalendarPreview,
});

const ACTIVITY_TYPE_COLORS: Record<string, EventViewColor> = {
  "gabinet:appointment": "indigo",
  call: "blue",
  meeting: "purple",
  email: "green",
  task: "orange",
  deadline: "pink",
  note: "gray",
};

function getEventColor(activityType: string, isCompleted: boolean, moduleId?: string): EventViewColor {
  if (isCompleted) return "gray";
  if (moduleId === "gabinet") return "indigo";
  return ACTIVITY_TYPE_COLORS[activityType] ?? "blue";
}

function CalendarPreview() {
  const { organizationId } = useOrganization();
  const calendarRef = useRef<CalendarHandle | null>(null);
  const { show: showMiniCal, hide: hideMiniCal } = useMiniCalendar();

  const { startTs, endTs } = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 4, 0, 23, 59, 59, 999);
    return { startTs: start.getTime(), endTs: end.getTime() };
  }, []);

  const { data: rawEvents } = useQuery(
    convexQuery(api.scheduledActivities.listForCalendar, {
      organizationId,
      startDate: startTs,
      endDate: endTs,
    })
  );

  const events: CalendarEvent[] = useMemo(() => {
    if (!rawEvents) return [];
    return rawEvents.map((a) => ({
      id: a._id,
      title: a.title,
      start: new Date(a.dueDate),
      end: new Date(a.endDate ?? a.dueDate + 60 * 60 * 1000),
      color: getEventColor(a.activityType, a.isCompleted, a.moduleRef?.moduleId),
      dot: a.isCompleted,
    }));
  }, [rawEvents]);

  // Hide mini calendar when leaving this page
  useEffect(() => {
    return () => hideMiniCal();
  }, [hideMiniCal]);

  const handleMiniCalDateChange = useCallback(
    (date: CalendarDate) => {
      calendarRef.current?.selectDate(date);
    },
    [],
  );

  // Show mini calendar permanently for day/week views
  const handleViewChange = useCallback(
    (view: string, selectedDate: CalendarDate | null, highlightedDates: Set<string>) => {
      if (view === "day" || view === "week") {
        showMiniCal(selectedDate, highlightedDates, handleMiniCalDateChange);
      } else {
        hideMiniCal();
      }
    },
    [showMiniCal, hideMiniCal, handleMiniCalDateChange],
  );

  // For month view: show mini cal only when sidebar opens (clicking a day)
  const handleSidebarChange = useCallback(
    (open: boolean, selectedDate: CalendarDate | null, highlightedDates: Set<string>) => {
      if (open && selectedDate) {
        showMiniCal(selectedDate, highlightedDates, handleMiniCalDateChange);
      } else {
        hideMiniCal();
      }
    },
    [showMiniCal, hideMiniCal, handleMiniCalDateChange],
  );

  return (
    <div className="flex flex-1 flex-col">
      <Calendar
        events={events}
        view="month"
        calendarRef={calendarRef}
        onSidebarChange={handleSidebarChange}
        onViewChange={handleViewChange}
      />
    </div>
  );
}
