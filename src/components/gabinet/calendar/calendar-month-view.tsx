import { useMemo } from "react";
import { useTranslation } from "react-i18next";

interface Appointment {
  _id: string;
  date: string;
  startTime: string;
  status: string;
  patientName: string;
  treatmentName: string;
}

interface CalendarMonthViewProps {
  year: number;
  month: number; // 0-11
  appointments: Appointment[];
  onDayClick?: (date: string) => void;
  selectedDate?: string;
  /** Dates covered by approved leave for the filtered employee. */
  leaveDates?: Set<string>;
  /** Dates with at least one non-cancelled appointment whose prepayment is required but unpaid. */
  paymentDueDates?: Set<string>;
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

export function CalendarMonthView({ year, month, appointments, onDayClick, selectedDate, leaveDates, paymentDueDates }: CalendarMonthViewProps) {
  const { t } = useTranslation();
  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const countByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of appointments) {
      if (a.status !== "cancelled") {
        m.set(a.date, (m.get(a.date) ?? 0) + 1);
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

          const count = countByDate.get(date) ?? 0;
          const isToday = date === today;
          const isLeave = leaveDates?.has(date) ?? false;
          const hasPaymentDue = paymentDueDates?.has(date) ?? false;

          return (
            <div
              key={date}
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
              <div className={`text-xs ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>
                {parseInt(date.split("-")[2])}
              </div>
              {isLeave && (
                <div className="mt-0.5">
                  <span className="inline-flex items-center rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
                    {t("gabinet.calendar.leaveBadge", { defaultValue: "Urlop" })}
                  </span>
                </div>
              )}
              {(count > 0 || hasPaymentDue) && (
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  {count > 0 && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      {count}
                    </span>
                  )}
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
