import { useDroppable } from "@dnd-kit/core";
import { ReactNode } from "react";

interface DroppableSlotProps {
  id: string;
  date: string;
  time: string;
  children?: ReactNode;
  className?: string;
}

export function DroppableSlot({ id, date, time, children, className }: DroppableSlotProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: {
      type: "time-slot",
      date,
      time,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${isOver ? "bg-primary/20 ring-2 ring-primary/50" : ""}`}
    >
      {children}
    </div>
  );
}
