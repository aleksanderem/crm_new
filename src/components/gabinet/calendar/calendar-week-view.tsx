import { useMemo } from "react";
import { AppointmentCard } from "./appointment-card";

interface Appointment {
  _id: string;
  date: string;
  startTime: string;
  endTime: string;
  patientName: string;
  treatmentName: string;
  status: string;
  color?: string;
}

interface CalendarWeekViewProps {
  weekStart: string; // Monday YYYY-MM-DD
  appointments: Appointment[];
  onSlotClick?: (date: string, time: string) => void;
  onAppointmentClick?: (id: string) => void;
  onDayHeaderClick?: (date: string) => void;
  selectedDate?: string;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekDates(start: string): string[] {
  const d = new Date(start + "T00:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day.toISOString().split("T")[0];
  });
}

function timeToTop(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return ((h - 7) * 60 + m);
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

export function CalendarWeekView({ weekStart, appointments, onSlotClick, onAppointmentClick, onDayHeaderClick, selectedDate }: CalendarWeekViewProps) {
  const dates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const today = new Date().toISOString().split("T")[0];

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
      </div>

      {/* Day columns */}
      {dates.map((date, di) => {
        const layouts = layoutsByDate.get(date) ?? [];
        const isToday = date === today;
        const isSelected = date === selectedDate;

        return (
          <div key={date} className="flex-1 min-w-[120px] border-r last:border-r-0">
            {/* Day header */}
            <div
              className={`sticky top-0 z-10 border-b px-2 py-1 text-center text-xs font-medium ${
                isSelected ? "bg-primary/20 ring-1 ring-inset ring-primary/30" : isToday ? "bg-primary/10" : "bg-muted/50"
              } ${onDayHeaderClick ? "cursor-pointer hover:bg-primary/15" : ""}`}
              onClick={() => onDayHeaderClick?.(date)}
            >
              <div>{DAY_LABELS[di]}</div>
              <div className={isToday ? "font-bold text-primary" : isSelected ? "font-semibold text-primary" : "text-muted-foreground"}>
                {date.split("-")[2]}
              </div>
            </div>

            {/* Hour slots */}
            <div className="relative">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="h-[60px] border-b border-dashed border-muted cursor-pointer hover:bg-muted/20"
                  onClick={() => onSlotClick?.(date, `${String(h).padStart(2, "0")}:00`)}
                />
              ))}

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
                    <AppointmentCard
                      {...appt}
                      onClick={() => onAppointmentClick?.(appt._id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
