// @ts-nocheck
import { useCallback, useMemo } from "react";
import { DraggableAppointment } from "./draggable-appointment";
import { DroppableSlot } from "./droppable-slot";
import { useDragToCreate } from "./use-drag-to-create";
import { useCurrentTime } from "@/hooks/use-current-time";

interface Appointment {
  _id: string;
  date: string;
  startTime: string;
  endTime: string;
  patientName: string;
  treatmentName: string;
  status: string;
  color?: string;
  tags?: Array<{ name: string; color: string }>;
}

interface CalendarWeekViewProps {
  weekStart: string; // Monday YYYY-MM-DD
  appointments: Appointment[];
  onSlotClick?: (date: string, time: string) => void;
  onSlotDragSelect?: (date: string, startTime: string, endTime: string) => void;
  onAppointmentClick?: (id: string) => void;
  onAppointmentResize?: (id: string, newEndTime: string) => void;
  onDayHeaderClick?: (date: string) => void;
  selectedDate?: string;
  employeeSchedules?: Map<string, { startTime: string; endTime: string; breakStart?: string; breakEnd?: string }>;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekDates(start: string): string[] {
  const d = new Date(start + "T00:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  });
}

function timeToTop(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return ((h - 7) * 60 + m);
}

function getDayOfWeek(date: string): number {
  const d = new Date(date + "T00:00:00");
  const day = d.getDay();
  return day === 0 ? 6 : day - 1; // Monday = 0, Sunday = 6
}

// Google Calendar-style cascading layout: each overlapping appointment
// offsets further right but still extends to the column edge.
interface LayoutedAppointment {
  appointment: Appointment;
  column: number;
  totalColumns: number;
}

function layoutDayAppointments(appts: Appointment[]): LayoutedAppointment[] {
  if (appts.length === 0) return [];

  const sorted = [...appts].sort((a, b) =>
    a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime)
  );

  const clusters: Appointment[][] = [];
  let clusterEnd = "";
  let currentCluster: Appointment[] = [];

  for (const appt of sorted) {
    if (currentCluster.length === 0 || appt.startTime < clusterEnd) {
      currentCluster.push(appt);
      if (appt.endTime > clusterEnd) clusterEnd = appt.endTime;
    } else {
      clusters.push(currentCluster);
      currentCluster = [appt];
      clusterEnd = appt.endTime;
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  const result: LayoutedAppointment[] = [];

  for (const cluster of clusters) {
    const columns: string[] = [];
    const assignments: { appointment: Appointment; column: number }[] = [];

    for (const appt of cluster) {
      let col = -1;
      for (let i = 0; i < columns.length; i++) {
        if (appt.startTime >= columns[i]) {
          col = i;
          break;
        }
      }
      if (col === -1) {
        col = columns.length;
        columns.push(appt.endTime);
      } else {
        columns[col] = appt.endTime;
      }
      assignments.push({ appointment: appt, column: col });
    }

    const totalColumns = columns.length;
    for (const a of assignments) {
      result.push({ ...a, totalColumns });
    }
  }

  return result;
}

interface WeekDayColumnProps {
  date: string;
  dayIndex: number;
  isToday: boolean;
  isSelected: boolean;
  layouts: LayoutedAppointment[];
  schedule?: { startTime: string; endTime: string; breakStart?: string; breakEnd?: string };
  currentTimeTop: number | null;
  onSlotClick?: (date: string, time: string) => void;
  onSlotDragSelect?: (date: string, startTime: string, endTime: string) => void;
  onAppointmentClick?: (id: string) => void;
  onAppointmentResize?: (id: string, newEndTime: string) => void;
  onDayHeaderClick?: (date: string) => void;
}

function WeekDayColumn({
  date,
  dayIndex,
  isToday,
  isSelected,
  layouts,
  schedule,
  currentTimeTop,
  onSlotClick,
  onSlotDragSelect,
  onAppointmentClick,
  onAppointmentResize,
  onDayHeaderClick,
}: WeekDayColumnProps) {
  const handleClick = useCallback(
    (time: string) => onSlotClick?.(date, time),
    [onSlotClick, date],
  );
  const handleDragSelect = useCallback(
    (startTime: string, endTime: string) =>
      onSlotDragSelect?.(date, startTime, endTime),
    [onSlotDragSelect, date],
  );

  const dragHandler = useDragToCreate({
    hoursStart: 7,
    hoursCount: HOURS.length,
    hourHeight: 60,
    snapMinutes: 15,
    minDragDistance: 8,
    onClick: handleClick,
    onDragSelect: handleDragSelect,
  });

  const dragTop = dragHandler.dragRange
    ? Math.min(dragHandler.dragRange.start, dragHandler.dragRange.end)
    : 0;
  const dragHeight = dragHandler.dragRange
    ? Math.abs(dragHandler.dragRange.end - dragHandler.dragRange.start)
    : 0;

  return (
    <div className="flex-1 min-w-[120px] border-r last:border-r-0">
      {/* Day header */}
      <div
        className={`sticky top-0 z-10 border-b px-2 py-1 text-center text-xs font-medium ${
          isSelected ? "bg-primary/20 ring-1 ring-inset ring-primary/30" : isToday ? "bg-primary/10" : "bg-muted/50"
        } ${onDayHeaderClick ? "cursor-pointer hover:bg-primary/15" : ""}`}
        onClick={() => onDayHeaderClick?.(date)}
      >
        <div>{DAY_LABELS[dayIndex]}</div>
        <div className={isToday ? "font-bold text-primary" : isSelected ? "font-semibold text-primary" : "text-muted-foreground"}>
          {date.split("-")[2]}
        </div>
      </div>

      {/* Hour slots */}
      <div
        ref={dragHandler.containerRef}
        className="relative select-none"
        onMouseDown={dragHandler.handleMouseDown}
      >
        {/* Closed hours background — entire day when clinic is closed */}
        {!schedule && (
          <div
            className="pointer-events-none absolute inset-0 bg-muted/60 z-0"
            style={{ height: `${HOURS.length * 60}px` }}
          />
        )}

        {/* Working / closed / break hour backgrounds */}
        {schedule && (
          <>
            {/* Closed: before clinic opens */}
            {timeToTop(schedule.startTime) > 0 && (
              <div
                className="pointer-events-none absolute left-0 right-0 bg-muted/60 z-0"
                style={{
                  top: 0,
                  height: `${timeToTop(schedule.startTime)}px`,
                }}
              />
            )}
            {/* Closed: after clinic closes */}
            {timeToTop(schedule.endTime) < HOURS.length * 60 && (
              <div
                className="pointer-events-none absolute left-0 right-0 bg-muted/60 z-0"
                style={{
                  top: `${timeToTop(schedule.endTime)}px`,
                  height: `${HOURS.length * 60 - timeToTop(schedule.endTime)}px`,
                }}
              />
            )}
            <div
              className="pointer-events-none absolute left-0 right-0 bg-primary/5 border-y border-primary/10 z-0"
              style={{
                top: `${timeToTop(schedule.startTime)}px`,
                height: `${timeToTop(schedule.endTime) - timeToTop(schedule.startTime)}px`,
              }}
            />
            {schedule.breakStart && schedule.breakEnd && (
              <div
                className="pointer-events-none absolute left-0 right-0 bg-orange-100/50 border-y border-orange-200/50 z-0"
                style={{
                  top: `${timeToTop(schedule.breakStart)}px`,
                  height: `${timeToTop(schedule.breakEnd) - timeToTop(schedule.breakStart)}px`,
                }}
              />
            )}
          </>
        )}

        {HOURS.map((h) => (
          <DroppableSlot
            key={h}
            id={`${date}-${h}`}
            date={date}
            time={`${String(h).padStart(2, "0")}:00`}
            className="h-[60px] border-b border-dashed border-muted"
          >
            <div className="relative h-full w-full cursor-pointer hover:bg-muted/20">
              <div className="pointer-events-none absolute left-0 right-0 top-[15px] border-t border-dashed border-muted/40" />
              <div className="pointer-events-none absolute left-0 right-0 top-[30px] border-t border-dashed border-muted/60" />
              <div className="pointer-events-none absolute left-0 right-0 top-[45px] border-t border-dashed border-muted/40" />
            </div>
          </DroppableSlot>
        ))}

        {/* Drag-to-create ghost */}
        {dragHandler.dragRange && dragHeight > 0 && (
          <div
            className="pointer-events-none absolute left-0.5 right-0.5 z-30 rounded-sm bg-primary/30 ring-2 ring-primary/60"
            style={{
              top: `${dragTop}px`,
              height: `${Math.max(dragHeight, 4)}px`,
            }}
          />
        )}

        {/* Current time line */}
        {isToday && currentTimeTop !== null && currentTimeTop > 0 && currentTimeTop < HOURS.length * 60 && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-20 border-t-2 border-red-500"
            style={{ top: `${currentTimeTop}px` }}
          >
            <div className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
          </div>
        )}

        {/* Appointments — cascading stack when overlapping */}
        {layouts.map((laid) => {
          const appt = laid.appointment;
          const top = timeToTop(appt.startTime);
          const height = timeToTop(appt.endTime) - top;
          if (top < 0 || height <= 0) return null;

          const step = Math.min(24, Math.floor(75 / laid.totalColumns));
          const leftPct = laid.column * step;

          return (
            <div
              key={appt._id}
              className={`absolute ${laid.column > 0 ? "shadow-md" : ""}`}
              style={{
                top: `${top}px`,
                height: `${Math.max(height, 18)}px`,
                left: `${leftPct}%`,
                right: '2px',
                zIndex: 10 + laid.column,
              }}
            >
              <DraggableAppointment
                {...appt}
                onAppointmentClick={onAppointmentClick}
                onResize={onAppointmentResize}
                hourHeight={60}
                snapMinutes={15}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarWeekView({ weekStart, appointments, onSlotClick, onSlotDragSelect, onAppointmentClick, onAppointmentResize, onDayHeaderClick, selectedDate, employeeSchedules }: CalendarWeekViewProps) {
  const dates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const now = useCurrentTime();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayInWeek = dates.includes(today);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimeTop = ((currentMinutes - 7 * 60) / 60) * 60;
  const showCurrentTime = todayInWeek && currentTimeTop > 0 && currentTimeTop < HOURS.length * 60;
  const currentTimeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const layoutsByDate = useMemo(() => {
    const map = new Map<string, LayoutedAppointment[]>();
    for (const date of dates) {
      const dayAppts = appointments.filter((a) => a.date === date);
      map.set(date, layoutDayAppointments(dayAppts));
    }
    return map;
  }, [dates, appointments]);

  return (
    <div className="flex h-full overflow-auto">
      {/* Time labels */}
      <div className="sticky left-0 z-10 w-14 shrink-0 border-r bg-background pt-8">
        {HOURS.map((h) => (
          <div key={h} className="flex h-[60px] items-start justify-end pr-2">
            <span className="text-xs text-muted-foreground">{String(h).padStart(2, "0")}:00</span>
          </div>
        ))}

        {/* Current time label in gutter */}
        {showCurrentTime && (
          <div
            className="pointer-events-none absolute right-0 z-30 -translate-y-1/2"
            style={{ top: `${currentTimeTop + 32}px` }}
          >
            <span className="mr-1 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm">
              {currentTimeLabel}
            </span>
          </div>
        )}
      </div>

      {/* Day columns */}
      {dates.map((date, di) => {
        const layouts = layoutsByDate.get(date) ?? [];
        const isToday = date === today;
        const isSelected = date === selectedDate;
        const schedule = employeeSchedules?.get(`${di}`);

        return (
          <WeekDayColumn
            key={date}
            date={date}
            dayIndex={di}
            isToday={isToday}
            isSelected={isSelected}
            layouts={layouts}
            schedule={schedule}
            currentTimeTop={isToday ? currentTimeTop : null}
            onSlotClick={onSlotClick}
            onSlotDragSelect={onSlotDragSelect}
            onAppointmentClick={onAppointmentClick}
            onAppointmentResize={onAppointmentResize}
            onDayHeaderClick={onDayHeaderClick}
          />
        );
      })}
    </div>
  );
}
