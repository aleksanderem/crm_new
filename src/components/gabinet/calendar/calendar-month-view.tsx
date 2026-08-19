import { useMemo, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";

interface Appointment {
  _id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  patientName: string;
  treatmentName: string;
  color?: string;
}

interface CalendarMonthViewProps {
  year: number;
  month: number; // 0-11
  appointments: Appointment[];
  onDayClick?: (date: string) => void;
  onAppointmentClick?: (appointmentId: string) => void;
  selectedDate?: string;
  /** Dates covered by approved leave for the filtered employee. */
  leaveDates?: Set<string>;
  /** Dates with at least one non-cancelled appointment whose prepayment is required but unpaid. */
  paymentDueDates?: Set<string>;
  /**
   * Dates carrying at least one patient's next unpaid visit whose available
   * credit balance > 0 — drives a small "Saldo" dot so users can spot
   * carry-forward credit at a glance (issue #1286).
   */
  creditDates?: Set<string>;
}

function getMonthGrid(year: number, month: number): (string | null)[][] {
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const grid: (string | null)[][] = [];
  let day = 1 - offset;

  for (let week = 0; week < 6; week++) {
    const row: (string | null)[] = [];
    for (let d = 0; d < 7; d++) {
      if (day >= 1 && day <= daysInMonth) {
        const mm = String(month + 1).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        row.push(`${year}-${mm}-${dd}`);
      } else {
        row.push(null);
      }
      day++;
    }
    if (row.some((r) => r !== null)) grid.push(row);
  }

  return grid;
}

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

const MAX_VISIBLE_CHIPS = 3;

function DraggableMonthChip({
  appointment,
  onAppointmentClick,
}: {
  appointment: Appointment;
  onAppointmentClick?: (appointmentId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: appointment._id,
    data: {
      type: "appointment",
      appointmentId: appointment._id,
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
    },
  });

  // Track whether a drag occurred so the post-drag click doesn't navigate.
  // useDraggable fires a synthetic onClick after every drag drop; without this
  // guard every successful reschedule would also open the detail page.
  const dragHappenedRef = useRef(false);
  useEffect(() => {
    if (isDragging) dragHappenedRef.current = true;
  }, [isDragging]);

  const bg = appointment.color ? `${appointment.color}26` : undefined;
  const textColor = appointment.color ?? undefined;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e: { stopPropagation(): void }) => {
        e.stopPropagation();
        if (dragHappenedRef.current) {
          dragHappenedRef.current = false;
          return;
        }
        onAppointmentClick?.(appointment._id);
      }}
      className={`truncate rounded px-1 py-0.5 text-[10px] font-medium touch-none select-none ${isDragging ? "opacity-40 cursor-grabbing" : onAppointmentClick ? "cursor-pointer hover:brightness-95" : "cursor-grab hover:brightness-95"}`}
      style={
        appointment.color
          ? { backgroundColor: bg, color: textColor }
          : { backgroundColor: "hsl(var(--primary)/0.1)", color: "hsl(var(--primary))" }
      }
      title={`${appointment.startTime} ${appointment.patientName}`}
    >
      {appointment.startTime} {appointment.patientName}
    </div>
  );
}

interface MonthDayCellProps {
  date: string;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  children: ReactNode;
}

function MonthDayCell({ date, className, style, onClick, children }: MonthDayCellProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `month-day-${date}`,
    data: { type: "date-slot", date },
  });

  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${isOver ? "ring-2 ring-inset ring-primary/60 bg-primary/10" : ""}`}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function CalendarMonthView({ year, month, appointments, onDayClick, onAppointmentClick, selectedDate, leaveDates, paymentDueDates, creditDates }: CalendarMonthViewProps) {
  const { t } = useTranslation();
  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const appointmentsByDate = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of appointments) {
      if (a.status !== "cancelled") {
        const list = m.get(a.date) ?? [];
        list.push(a);
        m.set(a.date, list);
      }
    }
    return m;
  }, [appointments]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="grid grid-cols-7 border-b">
        {DAY_LABEL_KEYS.map((k) => (
          <div key={k} className="px-2 py-1 text-center text-xs font-medium text-muted-foreground">
            {t(`gabinet.calendar.weekdaysShort.${k}`, {
              defaultValue: DAY_LABEL_DEFAULTS[k],
            })}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 grid auto-rows-fr" style={{ gridTemplateColumns: "repeat(7, 1fr)", gridTemplateRows: `repeat(${grid.length}, 1fr)` }}>
        {grid.flat().map((date, i) => {
          if (!date) {
            return <div key={i} className="border-b border-r bg-muted/20" />;
          }

          const dayAppointments = appointmentsByDate.get(date) ?? [];
          const visible = dayAppointments.slice(0, MAX_VISIBLE_CHIPS);
          const overflow = dayAppointments.length - visible.length;
          const isToday = date === today;
          const isLeave = leaveDates?.has(date) ?? false;
          const hasPaymentDue = paymentDueDates?.has(date) ?? false;
          const hasCredit = creditDates?.has(date) ?? false;

          return (
            <MonthDayCell
              key={date}
              date={date}
              className={`relative border-b border-r p-1 cursor-pointer hover:bg-muted/30 transition-colors ${date === selectedDate ? "bg-primary/15 ring-1 ring-inset ring-primary/30" : isToday ? "bg-primary/5" : ""}`}
              style={
                isLeave
                  ? {
                      backgroundImage:
                        "repeating-linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0px, rgba(245, 158, 11, 0.15) 6px, rgba(245, 158, 11, 0.04) 6px, rgba(245, 158, 11, 0.04) 12px)",
                    }
                  : undefined
              }
              onClick={() => onDayClick?.(date)}
            >
              <div className="flex items-center justify-between">
                <div className={`text-xs ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>
                  {parseInt(date.split("-")[2])}
                </div>
                {(hasPaymentDue || hasCredit) && (
                  <div className="flex items-center gap-0.5">
                    {hasPaymentDue && (
                      <span
                        title={t("gabinet.calendar.indicators.paymentDue", {
                          defaultValue: "Wymagana przedpłata",
                        })}
                        aria-label={t("gabinet.calendar.indicators.paymentDue", {
                          defaultValue: "Wymagana przedpłata",
                        })}
                        className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-amber-500 px-0.5 text-[10px] font-bold leading-none text-white"
                      >
                        $
                      </span>
                    )}
                    {hasCredit && (
                      <span
                        title={t("gabinet.calendar.indicators.credit", {
                          defaultValue: "Pacjent ma saldo do wykorzystania",
                        })}
                        aria-label={t("gabinet.calendar.indicators.credit", {
                          defaultValue: "Pacjent ma saldo do wykorzystania",
                        })}
                        className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-indigo-500 px-0.5 text-[10px] font-bold leading-none text-white"
                      >
                        +
                      </span>
                    )}
                  </div>
                )}
              </div>
              {isLeave && (
                <div className="mt-0.5">
                  <span className="inline-flex items-center rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
                    {t("gabinet.calendar.leaveBadge", { defaultValue: "Urlop" })}
                  </span>
                </div>
              )}
              <div className="mt-0.5 flex flex-col gap-0.5 overflow-hidden">
                {visible.map((a) => (
                  <DraggableMonthChip key={a._id} appointment={a} onAppointmentClick={onAppointmentClick} />
                ))}
                {overflow > 0 && (
                  <div className="px-1 text-[10px] text-muted-foreground">
                    +{overflow}
                  </div>
                )}
              </div>
            </MonthDayCell>
          );
        })}
      </div>
    </div>
  );
}
