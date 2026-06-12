// @ts-nocheck
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DraggableAppointment } from "./draggable-appointment";
import { DroppableSlot } from "./droppable-slot";
import { useDragToCreate } from "./use-drag-to-create";
import { useCurrentTime } from "@/hooks/use-current-time";
import { cn } from "@/lib/utils";
import type { AppointmentIndicator } from "./appointment-indicators";

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
  indicators?: AppointmentIndicator[];
  employeeCount?: number;
  employeeNames?: string[];
}

interface CalendarWeekViewProps {
  weekStart: string; // Monday YYYY-MM-DD
  appointments: Appointment[];
  onSlotClick?: (date: string, time: string) => void;
  onSlotDragSelect?: (date: string, startTime: string, endTime: string) => void;
  onAppointmentResize?: (id: string, newEndTime: string) => void;
  onDayHeaderClick?: (date: string) => void;
  selectedDate?: string;
  employeeSchedules?: Map<string, { startTime: string; endTime: string; breakStart?: string; breakEnd?: string }>;
  /** Approved leaves by date string (YYYY-MM-DD) for the filtered employee. */
  leavesByDate?: Map<string, { startTime?: string; endTime?: string }>;
  slotMinutes?: 5 | 10 | 15 | 30 | 60;
}

const LEAVE_STRIPE_BG =
  "repeating-linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0px, rgba(245, 158, 11, 0.18) 6px, rgba(245, 158, 11, 0.06) 6px, rgba(245, 158, 11, 0.06) 12px)";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);
const HOUR_HEIGHT = 90; // pixels per hour — taller rows so short appointments still fit patient + treatment lines
const DAY_LABEL_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABEL_DEFAULTS: Record<(typeof DAY_LABEL_KEYS)[number], string> = {
  mon: "Pon",
  tue: "Wt",
  wed: "Śr",
  thu: "Czw",
  fri: "Pt",
  sat: "Sob",
  sun: "Nd",
};

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
  return (((h - 7) * 60 + m) * HOUR_HEIGHT) / 60;
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
  isToday: boolean;
  layouts: LayoutedAppointment[];
  schedule?: { startTime: string; endTime: string; breakStart?: string; breakEnd?: string };
  leave?: { startTime?: string; endTime?: string } | null;
  currentTimeTop: number | null;
  onSlotClick?: (date: string, time: string) => void;
  onSlotDragSelect?: (date: string, startTime: string, endTime: string) => void;
  onAppointmentResize?: (id: string, newEndTime: string) => void;
  slotMinutes: 5 | 10 | 15 | 30 | 60;
  slots: ReturnType<typeof buildSlots>;
}

function WeekDayColumn({
  date,
  isToday,
  layouts,
  schedule,
  leave,
  currentTimeTop,
  onSlotClick,
  onSlotDragSelect,
  onAppointmentResize,
  slotMinutes,
  slots,
}: WeekDayColumnProps) {
  const { t } = useTranslation();
  const showSubdivisions = slotMinutes === 60;

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
    <div className="flex-1 min-w-[120px] border-r last:border-r-0">
      {/* Hour slots — day-of-week + date header lives in the sticky row
          rendered by the parent CalendarWeekView so it stays visible when the
          grid is scrolled vertically (issue #1234). */}
      <div
        ref={dragHandler.containerRef}
        className="relative select-none"
        onMouseDown={dragHandler.handleMouseDown}
      >
        {/* Closed hours background — entire day when clinic is closed */}
        {!schedule && (
          <div
            className="pointer-events-none absolute inset-0 bg-zinc-200/60 dark:bg-zinc-950/50 z-0"
            style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}
          />
        )}

        {/* Working / closed / break hour backgrounds */}
        {schedule && (
          <>
            {/* Closed: before clinic opens */}
            {timeToTop(schedule.startTime) > 0 && (
              <div
                className="pointer-events-none absolute left-0 right-0 bg-zinc-200/60 dark:bg-zinc-950/50 border-b border-border/40 z-0"
                style={{
                  top: 0,
                  height: `${timeToTop(schedule.startTime)}px`,
                }}
              />
            )}
            {/* Closed: after clinic closes */}
            {timeToTop(schedule.endTime) < HOURS.length * HOUR_HEIGHT && (
              <div
                className="pointer-events-none absolute left-0 right-0 bg-zinc-200/60 dark:bg-zinc-950/50 border-t border-border/40 z-0"
                style={{
                  top: `${timeToTop(schedule.endTime)}px`,
                  height: `${HOURS.length * HOUR_HEIGHT - timeToTop(schedule.endTime)}px`,
                }}
              />
            )}
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
            <span className="absolute left-0.5 top-0.5 rounded bg-amber-500/90 px-1 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-white shadow-sm">
              {leaveLabel}
            </span>
          </div>
        )}

        {slots.map((s) => (
          <DroppableSlot
            key={s.time}
            id={`${date}-${s.time}`}
            date={date}
            time={s.time}
            className={`border-b ${s.isHourMark ? "border-border" : "border-border/40"}`}
            style={{ height: `${s.slotHeight}px` }}
          >
            <div className="relative h-full w-full cursor-pointer hover:bg-muted/20">
              {showSubdivisions && (
                <>
                  <div
                    className="pointer-events-none absolute left-0 right-0 border-t border-border/30"
                    style={{ top: `${HOUR_HEIGHT / 4}px` }}
                  />
                  <div
                    className="pointer-events-none absolute left-0 right-0 border-t border-border/60"
                    style={{ top: `${HOUR_HEIGHT / 2}px` }}
                  />
                  <div
                    className="pointer-events-none absolute left-0 right-0 border-t border-border/30"
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
            className="pointer-events-none absolute left-0.5 right-0.5 z-30 rounded-sm bg-primary/30 ring-2 ring-primary/60"
            style={{
              top: `${dragTop}px`,
              height: `${Math.max(dragHeight, 4)}px`,
            }}
          />
        )}

        {/* Current time line */}
        {isToday && currentTimeTop !== null && currentTimeTop > 0 && currentTimeTop < HOURS.length * HOUR_HEIGHT && (
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

export function CalendarWeekView({ weekStart, appointments, onSlotClick, onSlotDragSelect, onAppointmentResize, onDayHeaderClick, selectedDate, employeeSchedules, leavesByDate, slotMinutes = 60 }: CalendarWeekViewProps) {
  const { t } = useTranslation();
  const dates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const now = useCurrentTime();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimeTop = ((currentMinutes - 7 * 60) / 60) * HOUR_HEIGHT;
  const currentTimeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayInView = dates.includes(today);
  const showCurrentTime = todayInView && currentTimeTop > 0 && currentTimeTop < HOURS.length * HOUR_HEIGHT;
  const slots = useMemo(() => buildSlots(slotMinutes), [slotMinutes]);

  const layoutsByDate = useMemo(() => {
    const map = new Map<string, LayoutedAppointment[]>();
    for (const date of dates) {
      const dayAppts = appointments.filter((a) => a.date === date);
      map.set(date, layoutDayAppointments(dayAppts));
    }
    return map;
  }, [dates, appointments]);

  // Single sticky header row (day-of-week + date) sits at the top of the
  // scroll container instead of one sticky element per day column. Per-flex-
  // item sticky-top isn't reliable on iOS Safari when the column's height is
  // driven by overflowing content — the column box ends up clipped to the
  // viewport and the sticky child scrolls away with it (issue #1234).
  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="sticky top-0 z-30 flex min-w-fit bg-background">
        {/* Corner cell — sticky-left so it stays at the time-labels position
            during horizontal scroll, and sticky-top via the parent row. */}
        <div className="sticky left-0 z-40 h-8 w-14 shrink-0 border-b border-r bg-background" />
        {dates.map((date, di) => {
          const isToday = date === today;
          const isSelected = date === selectedDate;
          return (
            <div
              key={date}
              className={cn(
                "flex-1 min-w-[120px] border-r last:border-r-0 border-b px-2 py-1 text-center text-xs font-medium",
                isSelected
                  ? "bg-primary/20 ring-1 ring-inset ring-primary/30"
                  : isToday
                    ? "bg-primary/10"
                    : "bg-muted/50",
                onDayHeaderClick && "cursor-pointer hover:bg-primary/15",
              )}
              onClick={() => onDayHeaderClick?.(date)}
            >
              <div>
                {t(`gabinet.calendar.weekdaysShort.${DAY_LABEL_KEYS[di]}`, {
                  defaultValue: DAY_LABEL_DEFAULTS[DAY_LABEL_KEYS[di]],
                })}
              </div>
              <div
                className={
                  isToday
                    ? "font-bold text-primary"
                    : isSelected
                      ? "font-semibold text-primary"
                      : "text-muted-foreground"
                }
              >
                {date.split("-")[2]}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex min-w-fit">
        {/* Time labels — sticky-left so they stay pinned during horizontal scroll. */}
        <div className="sticky left-0 z-20 w-14 shrink-0 border-r bg-background relative">
          {slots.map((s) => {
            // For small slot heights, only render the hour label so text doesn't overlap.
            const showLabel = s.isHourMark || s.slotHeight >= 15;
            return (
              <div
                key={s.time}
                className="flex items-start justify-end pr-2"
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
              style={{ top: `${currentTimeTop}px`, transform: "translateY(-50%)" }}
            >
              {currentTimeLabel}
            </div>
          )}
        </div>

        {/* Day columns (body only — headers are in the sticky row above) */}
        {dates.map((date) => {
          const layouts = layoutsByDate.get(date) ?? [];
          const isToday = date === today;
          // dayOfWeek is stored as Sun=0..Sat=6 (matches Date.getDay()) — see
          // convex/gabinet/_availability_supabase.ts. Issue #1205.
          const dow = new Date(date + "T00:00:00").getDay();
          const schedule = employeeSchedules?.get(`${dow}`);

          return (
            <WeekDayColumn
              key={date}
              date={date}
              isToday={isToday}
              layouts={layouts}
              schedule={schedule}
              leave={leavesByDate?.get(date) ?? null}
              currentTimeTop={isToday ? currentTimeTop : null}
              onSlotClick={onSlotClick}
              onSlotDragSelect={onSlotDragSelect}
              onAppointmentResize={onAppointmentResize}
              slotMinutes={slotMinutes}
              slots={slots}
            />
          );
        })}
      </div>
    </div>
  );
}
