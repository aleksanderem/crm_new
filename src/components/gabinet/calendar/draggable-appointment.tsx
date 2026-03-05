import { useDraggable } from "@dnd-kit/core";
import { AppointmentCard } from "./appointment-card";

interface Appointment {
  _id: string;
  date?: string;
  startTime: string;
  endTime: string;
  patientName: string;
  treatmentName: string;
  status: string;
  color?: string;
}

interface DraggableAppointmentProps extends Appointment {
  onAppointmentClick?: (id: string) => void;
}

export function DraggableAppointment({
  _id,
  date,
  startTime,
  endTime,
  patientName,
  treatmentName,
  status,
  color,
  onAppointmentClick,
}: DraggableAppointmentProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: _id,
    data: {
      type: "appointment",
      appointmentId: _id,
      date,
      startTime,
      endTime,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={isDragging ? "opacity-50 cursor-grabbing" : "cursor-grab"}
    >
      <AppointmentCard
        startTime={startTime}
        endTime={endTime}
        patientName={patientName}
        treatmentName={treatmentName}
        status={status}
        color={color}
        onClick={() => onAppointmentClick?.(_id)}
      />
    </div>
  );
}
