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
}

export interface DayByEmployeeColumn {
  userId: string;
  name: string;
  initials: string;
  schedule?: {
    startTime: string;
    endTime: string;
    breakStart?: string;
    breakEnd?: string;
  } | null;
  leave?: { startTime?: string; endTime?: string } | null;
}

interface CalendarDayByEmployeeViewProps {
  date: string;
  appointments: Appointment[];
  employees: DayByEmployeeColumn[];
  onSlotClick?: (date: string, time: string, employeeId: string) => void;
  onSlotDragSelect?: (
    date: string,
    startTime: string,
    endTime: string,
    employeeId: string,
  ) => void;
  onAppointmentResize?: (id: string, newEndTime: string) => void;
  slotMinutes?: 5 | 10 | 15 | 30 | 60;
}

const LEAVE_STRIPE_BG =
  "repeating-linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0px, rgba(245, 158, 11, 0.18) 6px, rgba(245, 158, 11, 0.06) 6px, rgba(245, 158, 11, 0.06) 12px)";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 – 20:00
const HOUR_HEIGHT = 90;

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

interface LayoutedAppointment {
  appointment: Appointment;
  column: number;
  totalColumns: number;
}

function layoutAppointments(appts: Appointment[]): LayoutedAppointment[] {
  if (appts.length === 0) return [];

  const sorted = [...appts].sort(
    (a, b) =>
      a.startTime.localeCompare(b.startTime) ||
      a.endTime.localeCompare(b.endTime),
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

interface EmployeeColumnProps {
  date: string;
  employee: DayByEmployeeColumn;
  appointments: Appointment[];
  slots: ReturnType<typeof buildSlots>;
  slotMinutes: 5 | 10 | 15 | 30 | 60;
  isToday: boolean;
  currentTimeTop: number | null;
  onSlotClick?: (date: string, time: string, employeeId: string) => void;
  onSlotDragSelect?: (
    date: string,
    startTime: string,
    endTime: string,
    employeeId: string,
  ) => void;
  onAppointmentResize?: (id: string, newEndTime: string) => void;
}

function EmployeeColumn({
  date,
  employee,
  appointments,
  slots,
  slotMinutes,
  isToday,
  currentTimeTop,
  onSlotClick,
  onSlotDragSelect,
  onAppointmentResize,
}: EmployeeColumnProps) {
  const { t } = useTranslation();
  const showSubdivisions = slotMinutes === 60;
  const layouts = useMemo(() => layoutAppointments(appointments), [appointments]);

  const schedule = employee.schedule ?? null;
  const leave = employee.leave ?? null;

  const workStartTop = schedule ? timeToTop(schedule.startTime) : null;
  const workEndTop = schedule ? timeToTop(schedule.endTime) : null;
  const breakStartTop = schedule?.breakStart
    ? timeToTop(schedule.breakStart)
    : null;
  const breakEndTop = schedule?.breakEnd ? timeToTop(schedule.breakEnd) : null;

  const leaveTop = leave ? (leave.startTime ? timeToTop(leave.startTime) : 0) : null;
  const leaveBottom = leave
    ? leave.endTime
      ? timeToTop(leave.endTime)
      : HOURS.length * HOUR_HEIGHT
    : null;
  const leaveHeight =
    leaveTop !== null && leaveBottom !== null ? leaveBottom - leaveTop : 0;
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
    (time: string) => onSlotClick?.(date, time, employee.userId),
    [onSlotClick, date, employee.userId],
  );
  const handleDragSelect = useCallback(
    (startTime: string, endTime: string) =>
      onSlotDragSelect?.(date, startTime, endTime, employee.userId),
    [onSlotDragSelect, date, employee.userId],
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
    <div className="flex-1 min-w-[140px] border-r last:border-r-0">
      {/* Employee header (avatar + name + working hours) lives in the sticky
          row rendered by the parent CalendarDayByEmployeeView so it stays
          visible when the grid is scrolled vertically (issue #1234). */}
      <div
        ref={dragHandler.containerRef}
        className="relative select-none"
        onMouseDown={dragHandler.handleMouseDown}
      >
        {/* Closed entire day */}
        {workStartTop === null && (
          <div
            className="pointer-events-none absolute inset-0 z-0 bg-zinc-200/60 dark:bg-zinc-950/50"
            style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}
          />
        )}

        {/* Closed: before working hours */}
        {workStartTop !== null && workStartTop > 0 && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-0 border-b border-border/40 bg-zinc-200/60 dark:bg-zinc-950/50"
            style={{ top: 0, height: `${workStartTop}px` }}
          />
        )}

        {/* Closed: after working hours */}
        {workEndTop !== null && workEndTop < HOURS.length * HOUR_HEIGHT && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-0 border-t border-border/40 bg-zinc-200/60 dark:bg-zinc-950/50"
            style={{
              top: `${workEndTop}px`,
              height: `${HOURS.length * HOUR_HEIGHT - workEndTop}px`,
            }}
          />
        )}

        {/* Break */}
        {breakStartTop !== null && breakEndTop !== null && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-0 border-y border-orange-200/50 bg-orange-100/50"
            style={{
              top: `${breakStartTop}px`,
              height: `${breakEndTop - breakStartTop}px`,
            }}
          />
        )}

        {/* Leave overlay */}
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

        {/* Slot rows */}
        {slots.map((s) => (
          <DroppableSlot
            key={s.time}
            id={`${date}-${employee.userId}-${s.time}`}
            date={date}
            time={s.time}
            employeeId={employee.userId}
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
        {isToday &&
          currentTimeTop !== null &&
          currentTimeTop > 0 &&
          currentTimeTop < HOURS.length * HOUR_HEIGHT && (
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
    </div>
  );
}

export function CalendarDayByEmployeeView({
  date,
  appointments,
  employees,
  onSlotClick,
  onSlotDragSelect,
  onAppointmentResize,
  slotMinutes = 60,
}: CalendarDayByEmployeeViewProps) {
  const { t } = useTranslation();
  const now = useCurrentTime();
  const isToday =
    date ===
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimeTop = ((currentMinutes - 7 * 60) / 60) * HOUR_HEIGHT;
  const currentTimeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const showCurrentTime =
    isToday && currentTimeTop > 0 && currentTimeTop < HOURS.length * HOUR_HEIGHT;

  const slots = useMemo(() => buildSlots(slotMinutes), [slotMinutes]);

  const appointmentsByEmployee = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const emp of employees) {
      map.set(emp.userId, []);
    }
    for (const a of appointments) {
      if (!a.employeeId) continue;
      const list = map.get(a.employeeId);
      if (list) list.push(a);
    }
    return map;
  }, [appointments, employees]);

  if (employees.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        {t("gabinet.calendar.noEmployees", {
          defaultValue: "Brak aktywnych pracowników.",
        })}
      </div>
    );
  }

  // Single sticky header row sits at the top of the scroll container
  // instead of one sticky element per employee column. Per-flex-item
  // sticky-top isn't reliable on iOS Safari when the column's height is
  // driven by overflowing content — the column box ends up clipped to the
  // viewport and the sticky child scrolls away with it (issue #1234).
  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="sticky top-0 z-30 flex min-w-fit bg-background">
        {/* Corner cell — sticky-left so it stays at the time-labels position
            during horizontal scroll. */}
        <div className="sticky left-0 z-40 h-[52px] w-14 shrink-0 border-b border-r bg-background" />
        {employees.map((emp) => (
          <div
            key={emp.userId}
            className={cn(
              "flex-1 min-w-[140px] border-r last:border-r-0 flex h-[52px] items-start gap-2 border-b bg-muted/40 px-2 py-2 text-xs font-medium",
            )}
          >
            <Avatar className="mt-0.5 h-6 w-6">
              <AvatarFallback className="bg-muted text-[10px] font-medium text-muted-foreground">
                {emp.initials || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate" title={emp.name}>
                {emp.name}
              </span>
              {emp.schedule ? (
                <span className="truncate text-[10px] font-normal text-muted-foreground">
                  {emp.schedule.startTime} – {emp.schedule.endTime}
                </span>
              ) : (
                <span className="truncate text-[10px] font-normal text-muted-foreground">
                  {t("gabinet.calendar.dayOff", { defaultValue: "dzień wolny" })}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex min-w-fit">
        {/* Time labels — sticky-left so they stay pinned during horizontal scroll. */}
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
              style={{
                top: `${currentTimeTop}px`,
                transform: "translateY(-50%)",
              }}
            >
              {currentTimeLabel}
            </div>
          )}
        </div>

        {/* Employee columns (body only — headers are in the sticky row above) */}
        {employees.map((emp) => (
          <EmployeeColumn
            key={emp.userId}
            date={date}
            employee={emp}
            appointments={appointmentsByEmployee.get(emp.userId) ?? []}
            slots={slots}
            slotMinutes={slotMinutes}
            isToday={isToday}
            currentTimeTop={isToday ? currentTimeTop : null}
            onSlotClick={onSlotClick}
            onSlotDragSelect={onSlotDragSelect}
            onAppointmentResize={onAppointmentResize}
          />
        ))}
      </div>
    </div>
  );
}
