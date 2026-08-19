import { useDroppable } from "@dnd-kit/core";
import { CSSProperties, ReactNode } from "react";

interface DroppableSlotProps {
  id: string;
  date: string;
  time: string;
  /** Optional employee id used by the per-employee day view so a drop carries
   *  the target column's owner, allowing the parent to reassign as well as
   *  reschedule the appointment. */
  employeeId?: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /**
   * "time-slot" (default) — drop changes both date and time (day/week views).
   * "date-slot" — drop changes only the date; the handler preserves the
   *   appointment's original time (month view).
   */
  slotType?: "time-slot" | "date-slot";
}

export function DroppableSlot({ id, date, time, employeeId, children, className, style, slotType = "time-slot" }: DroppableSlotProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: {
      type: slotType,
      date,
      time,
      employeeId,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${isOver ? "bg-primary/20 ring-2 ring-primary/50" : ""}`}
      style={style}
    >
      {children}
    </div>
  );
}
