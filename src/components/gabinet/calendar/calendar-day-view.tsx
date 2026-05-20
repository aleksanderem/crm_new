import { useCallback, useMemo } from "react";
import { DraggableAppointment } from "./draggable-appointment";
import { DroppableSlot } from "./droppable-slot";
import { useDragToCreate } from "./use-drag-to-create";
import { useCurrentTime } from "@/hooks/use-current-time";

interface Appointment {
  _id: string;
  startTime: string;
  endTime: string;
  patientName: string;
  treatmentName: string;
  status: string;
  color?: string;
  tags?: Array<{ name: string; color: string }>;
}

interface CalendarDayViewProps {
  date: string;
  appointments: Appointment[];
  onSlotClick?: (time: string) => void;
  onSlotDragSelect?: (date: string, startTime: string, endTime: string) => void;
  onAppointmentResize?: (id: string, newEndTime: string) => void;
  workingHours?: { startTime: string; endTime: string; breakStart?: string; breakEnd?: string } | null;
  slotMinutes?: 5 | 10 | 15 | 30 | 60;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 – 20:00
const HOUR_HEIGHT = 60; // 1 minute = 1px

function timeToTop(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return ((h - 7) * 60 + m);
}

function buildSlots(slotMinutes: number) {
  const slotsPerHour = 60 / slotMinutes;
  const slotHeight = HOUR_HEIGHT / slotsPerHour;
  const totalSlots = HOURS.length * slotsPerHour;
  return Array.from({ length: totalSlots }, (_, i) => {
    const minutesFromStart = i * slotMinutes;
    const h = 7 + Math.floor(minutesFromStart / 60);
    const m = minutesFromStart % 60;
    const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    return { time, h, m, slotHeight, isHourMark: m === 0 };
  });
}

// Google Calendar-style cascading layout: each overlapping appointment
// offsets further right but still extends to the column edge.
interface LayoutedAppointment {
  appointment: Appointment;
  column: number;
  totalColumns: number;
}

function layoutAppointments(appts: Appointment[]): LayoutedAppointment[] {
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

export function CalendarDayView({ date, appointments, onSlotClick, onSlotDragSelect, onAppointmentResize, workingHours, slotMinutes = 60 }: CalendarDayViewProps) {
  const now = useCurrentTime();
  const isToday = date === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentLineTop = ((currentMinutes - 7 * 60) / 60) * 60;
  const currentTimeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const showCurrentTime = isToday && currentLineTop > 0 && currentLineTop < HOURS.length * 60;

  const slots = useMemo(() => buildSlots(slotMinutes), [slotMinutes]);
  const showSubdivisions = slotMinutes === 60;

  const layouts = useMemo(() => layoutAppointments(appointments), [appointments]);

  // Calculate working hours background positions
  const workStartTop = workingHours ? timeToTop(workingHours.startTime) : null;
  const workEndTop = workingHours ? timeToTop(workingHours.endTime) : null;
  const breakStartTop = workingHours?.breakStart ? timeToTop(workingHours.breakStart) : null;
  const breakEndTop = workingHours?.breakEnd ? timeToTop(workingHours.breakEnd) : null;

  const handleClick = useCallback(
    (time: string) => onSlotClick?.(time),
    [onSlotClick],
  );
  const handleDragSelect = useCallback(
    (startTime: string, endTime: string) =>
      onSlotDragSelect?.(date, startTime, endTime),
    [onSlotDragSelect, date],
  );

  const dragHandler = useDragToCreate({
    hoursStart: 7,
    hoursCount: HOURS.length,
    hourHeight: HOUR_HEIGHT,
    snapMinutes: Math.min(15, slotMinutes),
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
    <div className="relative flex h-full overflow-y-auto">
      {/* Time labels */}
      <div className="sticky left-0 z-10 w-16 shrink-0 border-r bg-background relative">
        {slots.map((s) => {
          // For small slot heights, only render the hour label so text doesn't overlap.
          const showLabel = s.isHourMark || s.slotHeight >= 15;
          return (
            <div
              key={s.time}
              className="flex items-start justify-end pr-2 pt-0"
              style={{ height: `${s.slotHeight}px` }}
            >
              {showLabel && (
                <span
                  className={`${s.isHourMark ? "text-xs font-medium text-muted-foreground" : "text-[10px] text-muted-foreground/60"} leading-none`}
                >
                  {s.time}
                </span>
              )}
            </div>
          );
        })}
        {showCurrentTime && (
          <div
            className="pointer-events-none absolute right-1 z-30 rounded bg-red-500 px-1 py-0.5 text-[10px] font-semibold leading-none text-white shadow"
            style={{ top: `${currentLineTop}px`, transform: "translateY(-50%)" }}
          >
            {currentTimeLabel}
          </div>
        )}
      </div>

      {/* Grid + appointments */}
      <div
        ref={dragHandler.containerRef}
        className="relative flex-1 select-none"
        onMouseDown={dragHandler.handleMouseDown}
      >
        {/* Closed hours background — entire day when clinic is closed */}
        {workStartTop === null && (
          <div
            className="pointer-events-none absolute inset-0 bg-primary/5"
            style={{ height: `${HOURS.length * 60}px` }}
          />
        )}

        {/* Closed: before clinic opens */}
        {workStartTop !== null && workStartTop > 0 && (
          <div
            className="pointer-events-none absolute left-0 right-0 bg-primary/5 border-b border-primary/10"
            style={{
              top: 0,
              height: `${workStartTop}px`,
            }}
          />
        )}

        {/* Closed: after clinic closes */}
        {workEndTop !== null && workEndTop < HOURS.length * 60 && (
          <div
            className="pointer-events-none absolute left-0 right-0 bg-primary/5 border-t border-primary/10"
            style={{
              top: `${workEndTop}px`,
              height: `${HOURS.length * 60 - workEndTop}px`,
            }}
          />
        )}

        {/* Break time background */}
        {breakStartTop !== null && breakEndTop !== null && (
          <div
            className="pointer-events-none absolute left-0 right-0 bg-orange-100/50 border-y border-orange-200/50"
            style={{
              top: `${breakStartTop}px`,
              height: `${breakEndTop - breakStartTop}px`,
            }}
          />
        )}

        {/* Slot rows — solid border at hour marks, faded at sub-slot marks */}
        {slots.map((s) => (
          <DroppableSlot
            key={s.time}
            id={`${date}-${s.time}`}
            date={date}
            time={s.time}
            className={`border-b border-dashed ${s.isHourMark ? "border-muted" : "border-muted/40"}`}
            style={{ height: `${s.slotHeight}px` }}
          >
            <div className="relative h-full w-full cursor-pointer hover:bg-muted/30">
              {showSubdivisions && (
                <>
                  <div className="pointer-events-none absolute left-0 right-0 top-[15px] border-t border-dashed border-muted/40" />
                  <div className="pointer-events-none absolute left-0 right-0 top-[30px] border-t border-dashed border-muted/60" />
                  <div className="pointer-events-none absolute left-0 right-0 top-[45px] border-t border-dashed border-muted/40" />
                </>
              )}
            </div>
          </DroppableSlot>
        ))}

        {/* Drag-to-create ghost */}
        {dragHandler.dragRange && dragHeight > 0 && (
          <div
            className="pointer-events-none absolute left-1 right-1 z-30 rounded-sm bg-primary/30 ring-2 ring-primary/60"
            style={{
              top: `${dragTop}px`,
              height: `${Math.max(dragHeight, 4)}px`,
            }}
          />
        )}

        {/* Current time line */}
        {isToday && currentLineTop > 0 && currentLineTop < HOURS.length * 60 && (
          <div
            className="absolute left-0 right-0 z-20 border-t-2 border-red-500"
            style={{ top: `${currentLineTop}px` }}
          >
            <div className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
          </div>
        )}

        {/* Appointment blocks — cascading stack when overlapping */}
        {layouts.map((laid) => {
          const appt = laid.appointment;
          const top = timeToTop(appt.startTime);
          const height = timeToTop(appt.endTime) - top;
          if (top < 0 || height <= 0) return null;

          const step = Math.min(32, Math.floor(85 / laid.totalColumns));
          const leftPct = laid.column * step;

          return (
            <div
              key={appt._id}
              className={`absolute ${laid.column > 0 ? "shadow-md" : ""}`}
              style={{
                top: `${top}px`,
                height: `${Math.max(height, 20)}px`,
                left: `${leftPct}%`,
                right: '4px',
                zIndex: 10 + laid.column,
              }}
            >
              <DraggableAppointment
                {...appt}
                date={date}
                onResize={onAppointmentResize}
                hourHeight={HOUR_HEIGHT}
                snapMinutes={Math.min(15, slotMinutes)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
