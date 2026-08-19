import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  variantName?: string;
  status: string;
  color?: string;
  employeeId?: string;
  tags?: Array<{ name: string; color: string }>;
  indicators?: AppointmentIndicator[];
  employeeCount?: number;
  employeeNames?: string[];
}

export interface WeekByEmployeeColumn {
  userId: string;
  name: string;
  initials: string;
}

interface CalendarWeekByEmployeeViewProps {
  weekStart: string;
  appointments: Appointment[];
  employees: WeekByEmployeeColumn[];
  /** employeeId → dayOfWeek (0–6, Sun=0) → schedule */
  scheduleByEmployee?: Map<string, Map<string, { startTime: string; endTime: string; breakStart?: string; breakEnd?: string }>>;
  /** employeeId → date (YYYY-MM-DD) → leave window */
  leaveByEmployeeAndDate?: Map<string, Map<string, { startTime?: string; endTime?: string }>>;
  onSlotClick?: (date: string, time: string, employeeId: string) => void;
  onSlotDragSelect?: (date: string, startTime: string, endTime: string, employeeId: string) => void;
  onAppointmentResize?: (id: string, newEndTime: string) => void;
  onDayHeaderClick?: (date: string) => void;
  selectedDate?: string;
  slotMinutes?: 5 | 10 | 15 | 30 | 60;
}

const LEAVE_STRIPE_BG =
  "repeating-linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0px, rgba(245, 158, 11, 0.18) 6px, rgba(245, 158, 11, 0.06) 6px, rgba(245, 158, 11, 0.06) 12px)";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);
const HOUR_HEIGHT = 90;
const EMPLOYEE_COL_MIN_WIDTH = 100; // px per employee sub-column

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

interface LayoutedAppointment {
  appointment: Appointment;
  column: number;
  totalColumns: number;
}

function layoutAppointments(appts: Appointment[]): LayoutedAppointment[] {
  if (appts.length === 0) return [];
  const sorted = [...appts].sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime),
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
    for (const a of assignments) result.push({ ...a, totalColumns });
  }
  return result;
}

interface DayEmployeeCellProps {
  date: string;
  employeeId: string;
  appointments: Appointment[];
  schedule?: { startTime: string; endTime: string; breakStart?: string; breakEnd?: string } | null;
  leave?: { startTime?: string; endTime?: string } | null;
  slots: ReturnType<typeof buildSlots>;
  slotMinutes: 5 | 10 | 15 | 30 | 60;
  isToday: boolean;
  currentTimeTop: number | null;
  onSlotClick?: (date: string, time: string, employeeId: string) => void;
  onSlotDragSelect?: (date: string, startTime: string, endTime: string, employeeId: string) => void;
  onAppointmentResize?: (id: string, newEndTime: string) => void;
}

function DayEmployeeCell({
  date,
  employeeId,
  appointments,
  schedule,
  leave,
  slots,
  slotMinutes,
  isToday,
  currentTimeTop,
  onSlotClick,
  onSlotDragSelect,
  onAppointmentResize,
}: DayEmployeeCellProps) {
  const { t } = useTranslation();
  const showSubdivisions = slotMinutes === 60;
  const layouts = useMemo(() => layoutAppointments(appointments), [appointments]);

  const workStartTop = schedule ? timeToTop(schedule.startTime) : null;
  const workEndTop = schedule ? timeToTop(schedule.endTime) : null;
  const breakStartTop = schedule?.breakStart ? timeToTop(schedule.breakStart) : null;
  const breakEndTop = schedule?.breakEnd ? timeToTop(schedule.breakEnd) : null;

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
    (time: string) => onSlotClick?.(date, time, employeeId),
    [onSlotClick, date, employeeId],
  );
  const handleDragSelect = useCallback(
    (startTime: string, endTime: string) => onSlotDragSelect?.(date, startTime, endTime, employeeId),
    [onSlotDragSelect, date, employeeId],
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
    <div
      ref={dragHandler.containerRef}
      className="relative flex-1 border-r last:border-r-0 select-none"
      style={{ minWidth: `${EMPLOYEE_COL_MIN_WIDTH}px` }}
      onMouseDown={dragHandler.handleMouseDown}
    >
      {/* Closed all day */}
      {workStartTop === null && (
        <div
          className="pointer-events-none absolute inset-0 z-0 bg-zinc-200/60 dark:bg-zinc-950/50"
          style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}
        />
      )}
      {/* Before working hours */}
      {workStartTop !== null && workStartTop > 0 && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-0 border-b border-border/40 bg-zinc-200/60 dark:bg-zinc-950/50"
          style={{ top: 0, height: `${workStartTop}px` }}
        />
      )}
      {/* After working hours */}
      {workEndTop !== null && workEndTop < HOURS.length * HOUR_HEIGHT && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-0 border-t border-border/40 bg-zinc-200/60 dark:bg-zinc-950/50"
          style={{ top: `${workEndTop}px`, height: `${HOURS.length * HOUR_HEIGHT - workEndTop}px` }}
        />
      )}
      {/* Break */}
      {breakStartTop !== null && breakEndTop !== null && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-0 border-y border-orange-200/50 bg-orange-100/50"
          style={{ top: `${breakStartTop}px`, height: `${breakEndTop - breakStartTop}px` }}
        />
      )}
      {/* Leave overlay */}
      {leave && leaveTop !== null && leaveHeight > 0 && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-[5] border-y border-amber-400/70 dark:border-amber-500/60"
          style={{ top: `${leaveTop}px`, height: `${leaveHeight}px`, backgroundImage: LEAVE_STRIPE_BG }}
          title={t("gabinet.calendar.leaveOverlayTitle", { defaultValue: "Pracownik ma zatwierdzony urlop" })}
          aria-label={leaveLabel}
        >
          <span className="absolute left-0.5 top-0.5 rounded bg-amber-500/90 px-1 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-white shadow-sm">
            {leaveLabel}
          </span>
        </div>
      )}
      {/* Slot rows */}
      {slots.map((s) => (
        <DroppableSlot
          key={s.time}
          id={`${date}-${employeeId}-${s.time}`}
          date={date}
          time={s.time}
          employeeId={employeeId}
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
          style={{ top: `${dragTop}px`, height: `${Math.max(dragHeight, 4)}px` }}
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
      {/* Appointments */}
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
              right: "2px",
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
  );
}

export function CalendarWeekByEmployeeView({
  weekStart,
  appointments,
  employees,
  scheduleByEmployee,
  leaveByEmployeeAndDate,
  onSlotClick,
  onSlotDragSelect,
  onAppointmentResize,
  onDayHeaderClick,
  selectedDate,
  slotMinutes = 60,
}: CalendarWeekByEmployeeViewProps) {
  const { t } = useTranslation();
  const dates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const now = useCurrentTime();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimeTop = ((currentMinutes - 7 * 60) / 60) * HOUR_HEIGHT;
  const currentTimeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayInView = dates.includes(today);
  const showCurrentTime =
    todayInView && currentTimeTop > 0 && currentTimeTop < HOURS.length * HOUR_HEIGHT;
  const slots = useMemo(() => buildSlots(slotMinutes), [slotMinutes]);

  // (date, employeeId) → appointments[]
  const appointmentsByDateAndEmployee = useMemo(() => {
    const map = new Map<string, Map<string, Appointment[]>>();
    for (const date of dates) {
      const empMap = new Map<string, Appointment[]>();
      for (const emp of employees) empMap.set(emp.userId, []);
      map.set(date, empMap);
    }
    for (const a of appointments) {
      if (!a.employeeId || !a.date) continue;
      const empMap = map.get(a.date);
      if (!empMap) continue;
      const list = empMap.get(a.employeeId);
      if (list) list.push(a);
    }
    return map;
  }, [dates, appointments, employees]);

  if (employees.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        {t("gabinet.calendar.noEmployees", { defaultValue: "Brak aktywnych pracowników." })}
      </div>
    );
  }

  // Width of each day group = N employees × min column width
  const dayGroupMinWidth = employees.length * EMPLOYEE_COL_MIN_WIDTH;

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Two-row sticky header:
          Row 1 — day name + date (spans all employee sub-columns for that day)
          Row 2 — employee avatar + name + working hours
          Both rows live in a single flex row so the corner cell auto-stretches
          to the correct height via flex align-stretch (issue #1234 pattern). */}
      <div className="sticky top-0 z-30 flex min-w-fit bg-background">
        {/* Corner cell — stretches to match sibling day-block height */}
        <div className="sticky left-0 z-40 w-14 shrink-0 border-b border-r bg-background" />
        {/* Day blocks */}
        {dates.map((date, di) => {
          const isToday = date === today;
          const isSelected = date === selectedDate;
          return (
            <div
              key={date}
              className="flex flex-col border-r last:border-r-0"
              style={{ minWidth: `${dayGroupMinWidth}px` }}
            >
              {/* Day label */}
              <div
                className={cn(
                  "border-b px-2 py-1 text-center text-xs font-medium",
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
              {/* Employee sub-headers */}
              <div className="flex">
                {employees.map((emp) => {
                  const dow = new Date(date + "T00:00:00").getDay();
                  const sched = scheduleByEmployee?.get(emp.userId)?.get(`${dow}`);
                  return (
                    <div
                      key={emp.userId}
                      className="flex h-[36px] flex-1 items-center gap-1.5 border-b border-r bg-muted/40 px-1.5 text-xs font-medium last:border-r-0"
                      style={{ minWidth: `${EMPLOYEE_COL_MIN_WIDTH}px` }}
                    >
                      <Avatar className="h-5 w-5 shrink-0">
                        <AvatarFallback className="bg-muted text-[10px] font-medium text-muted-foreground">
                          {emp.initials || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate" title={emp.name}>
                          {emp.name}
                        </span>
                        {sched ? (
                          <span className="truncate text-[10px] font-normal text-muted-foreground">
                            {sched.startTime} – {sched.endTime}
                          </span>
                        ) : (
                          <span className="truncate text-[10px] font-normal text-muted-foreground">
                            {t("gabinet.calendar.dayOff", { defaultValue: "dzień wolny" })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex min-w-fit">
        {/* Time labels — sticky-left */}
        <div className="sticky left-0 z-20 w-14 shrink-0 border-r bg-background relative">
          {slots.map((s) => {
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

        {/* Day × Employee body columns */}
        {dates.map((date) => {
          const isToday = date === today;
          const dow = new Date(date + "T00:00:00").getDay();
          const dayEmpMap = appointmentsByDateAndEmployee.get(date);
          return (
            <div
              key={date}
              className="flex border-r last:border-r-0"
              style={{ minWidth: `${dayGroupMinWidth}px` }}
            >
              {employees.map((emp) => {
                const sched = scheduleByEmployee?.get(emp.userId)?.get(`${dow}`) ?? null;
                const leave = leaveByEmployeeAndDate?.get(emp.userId)?.get(date) ?? null;
                const empAppts = dayEmpMap?.get(emp.userId) ?? [];
                return (
                  <DayEmployeeCell
                    key={emp.userId}
                    date={date}
                    employeeId={emp.userId}
                    appointments={empAppts}
                    schedule={sched}
                    leave={leave}
                    slots={slots}
                    slotMinutes={slotMinutes}
                    isToday={isToday}
                    currentTimeTop={isToday ? currentTimeTop : null}
                    onSlotClick={onSlotClick}
                    onSlotDragSelect={onSlotDragSelect}
                    onAppointmentResize={onAppointmentResize}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
