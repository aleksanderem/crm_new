import { useMemo } from "react";
import { AppointmentCard } from "./appointment-card";

interface Appointment {
  _id: string;
  startTime: string;
  endTime: string;
  patientName: string;
  treatmentName: string;
  status: string;
  color?: string;
}

interface CalendarDayViewProps {
  date: string;
  appointments: Appointment[];
  onSlotClick?: (time: string) => void;
  onAppointmentClick?: (id: string) => void;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 – 20:00

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

export function CalendarDayView({ date, appointments, onSlotClick, onAppointmentClick }: CalendarDayViewProps) {
  const now = new Date();
  const isToday = date === now.toISOString().split("T")[0];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentLineTop = ((currentMinutes - 7 * 60) / 60) * 60;

  const layouts = useMemo(() => layoutAppointments(appointments), [appointments]);

  return (
    <div className="relative flex h-full overflow-y-auto">
      {/* Time labels */}
      <div className="sticky left-0 z-10 w-16 shrink-0 border-r bg-background">
        {HOURS.map((h) => (
          <div key={h} className="flex h-[60px] items-start justify-end pr-2 pt-0">
            <span className="text-xs text-muted-foreground">
              {String(h).padStart(2, "0")}:00
            </span>
          </div>
        ))}
      </div>

      {/* Grid + appointments */}
      <div className="relative flex-1">
        {/* Hour lines */}
        {HOURS.map((h) => (
          <div
            key={h}
            className="h-[60px] border-b border-dashed border-muted cursor-pointer hover:bg-muted/30"
            onClick={() => onSlotClick?.(`${String(h).padStart(2, "0")}:00`)}
          />
        ))}

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
}
