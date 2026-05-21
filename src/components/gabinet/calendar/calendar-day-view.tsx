import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
  /** Approved leave overlapping this date for the filtered employee. */
  leave?: { startTime?: string; endTime?: string } | null;
  slotMinutes?: 5 | 10 | 15 | 30 | 60;
}

const LEAVE_STRIPE_BG =
  "repeating-linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0px, rgba(245, 158, 11, 0.18) 6px, rgba(245, 158, 11, 0.06) 6px, rgba(245, 158, 11, 0.06) 12px)";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 – 20:00
const HOUR_HEIGHT = 90; // pixels per hour — taller rows so short appointments still fit patient + treatment lines

function timeToTop(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (((h - 7) * 60 + m) * HOUR_HEIGHT) / 60;
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

export function CalendarDayView({ date, appointments, onSlotClick, onSlotDragSelect, onAppointmentResize, workingHours, leave, slotMinutes = 60 }: CalendarDayViewProps) {
  const { t } = useTranslation();
  const now = useCurrentTime();
  const isToday = date === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentLineTop = ((currentMinutes - 7 * 60) / 60) * HOUR_HEIGHT;
  const currentTimeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const showCurrentTime = isToday && currentLineTop > 0 && currentLineTop < HOURS.length * HOUR_HEIGHT;

  const slots = useMemo(() => buildSlots(slotMinutes), [slotMinutes]);
  const showSubdivisions = slotMinutes === 60;

  const layouts = useMemo(() => layoutAppointments(appointments), [appointments]);

  // Calculate working hours background positions
  const workStartTop = workingHours ? timeToTop(workingHours.startTime) : null;
  const workEndTop = workingHours ? timeToTop(workingHours.endTime) : null;
  const breakStartTop = workingHours?.breakStart ? timeToTop(workingHours.breakStart) : null;
  const breakEndTop = workingHours?.breakEnd ? timeToTop(workingHours.breakEnd) : null;

  // Leave block — full day if no times set, otherwise the specified range.
  const leaveTop = leave ? (leave.startTime ? timeToTop(leave.startTime) : 0) : null;
  const leaveBottom = leave
    ? leave.endTime
      ? timeToTop(leave.endTime)
      : HOURS.length * HOUR_HEIGHT
    : null;
  const leaveHeight = leaveTop !== null && leaveBottom !== null ? leaveBottom - leaveTop : 0;
  const leaveLabel = leave
    ? leave.startTime && leave.endTime
      ? t("gabinet.calendar.leaveBadgePartial", {
          start: leave.startTime,
          end: leave.endTime,
          defaultValue: "Urlop {{start}}–{{end}}",
        })
      : t("gabinet.calendar.leaveBadge", { defaultValue: "Urlop" })
    : "";

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
            style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}
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
        {workEndTop !== null && workEndTop < HOURS.length * HOUR_HEIGHT && (
          <div
            className="pointer-events-none absolute left-0 right-0 bg-primary/5 border-t border-primary/10"
            style={{
              top: `${workEndTop}px`,
              height: `${HOURS.length * HOUR_HEIGHT - workEndTop}px`,
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

        {/* Approved leave overlay */}
        {leave && leaveTop !== null && leaveHeight > 0 && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-[5] border-y border-amber-400/70 dark:border-amber-500/60"
            style={{
              top: `${leaveTop}px`,
              height: `${leaveHeight}px`,
              backgroundImage: LEAVE_STRIPE_BG,
            }}
            title={t("gabinet.calendar.leaveOverlayTitle", {
              defaultValue: "Pracownik ma zatwierdzony urlop",
            })}
            aria-label={leaveLabel}
          >
            <span className="absolute left-1 top-1 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
              {leaveLabel}
            </span>
          </div>
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
                  <div
                    className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-muted/40"
                    style={{ top: `${HOUR_HEIGHT / 4}px` }}
                  />
                  <div
                    className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-muted/60"
                    style={{ top: `${HOUR_HEIGHT / 2}px` }}
                  />
                  <div
                    className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-muted/40"
                    style={{ top: `${(HOUR_HEIGHT * 3) / 4}px` }}
                  />
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
        {isToday && currentLineTop > 0 && currentLineTop < HOURS.length * HOUR_HEIGHT && (
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
