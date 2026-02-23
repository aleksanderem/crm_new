import { useMemo } from "react";

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

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarMonthView({ year, month, appointments, onDayClick, selectedDate }: CalendarMonthViewProps) {
  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const today = new Date().toISOString().split("T")[0];

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
        {DAY_LABELS.map((d) => (
          <div key={d} className="px-2 py-1 text-center text-xs font-medium text-muted-foreground">
            {d}
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

          return (
            <div
              key={date}
              className={`border-b border-r p-1 cursor-pointer hover:bg-muted/30 transition-colors ${date === selectedDate ? "bg-primary/15 ring-1 ring-inset ring-primary/30" : isToday ? "bg-primary/5" : ""}`}
              onClick={() => onDayClick?.(date)}
            >
              <div className={`text-xs ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>
                {parseInt(date.split("-")[2])}
              </div>
              {count > 0 && (
                <div className="mt-0.5">
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                    {count}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
