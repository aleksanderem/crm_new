import { useDraggable } from "@dnd-kit/core";
import { useCallback, useState } from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  AppointmentCard,
  type AppointmentTag,
  type AppointmentIndicator,
} from "./appointment-card";
import { AppointmentPreviewContent } from "./appointment-preview-content";

interface Appointment {
  _id: string;
  date?: string;
  startTime: string;
  endTime: string;
  patientName: string;
  treatmentName: string;
  status: string;
  color?: string;
  tags?: AppointmentTag[];
  indicators?: AppointmentIndicator[];
}

interface DraggableAppointmentProps extends Appointment {
  onResize?: (id: string, newEndTime: string) => void;
  hourHeight?: number;
  snapMinutes?: number;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
  tags,
  indicators,
  onResize,
  hourHeight = 60,
  snapMinutes = 15,
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

  const [previewEndTime, setPreviewEndTime] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  // Suppress popover open when the click follows a drag — useDraggable triggers
  // onClick after a successful drop, which would otherwise pop the preview.
  const isPopoverDisabled = status === "blocked";

  const startMinutes = timeToMinutes(startTime);
  const originalEndMinutes = timeToMinutes(endTime);
  const pxPerMinute = hourHeight / 60;

  const handleResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !onResize) return;
      e.stopPropagation();
      e.preventDefault();
      const initialY = e.clientY;

      const calcEndMinutes = (clientY: number) => {
        const deltaPx = clientY - initialY;
        const deltaMin = deltaPx / pxPerMinute;
        const snappedDelta = Math.round(deltaMin / snapMinutes) * snapMinutes;
        return Math.max(
          startMinutes + snapMinutes,
          originalEndMinutes + snappedDelta,
        );
      };

      const handleMove = (ev: PointerEvent) => {
        setPreviewEndTime(minutesToTime(calcEndMinutes(ev.clientY)));
      };

      const handleUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        const finalEndMinutes = calcEndMinutes(ev.clientY);
        setPreviewEndTime(null);

        if (finalEndMinutes !== originalEndMinutes) {
          onResize(_id, minutesToTime(finalEndMinutes));
        }
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [_id, onResize, originalEndMinutes, pxPerMinute, snapMinutes, startMinutes],
  );

  const displayEndTime = previewEndTime ?? endTime;
  const previewHeightPx =
    previewEndTime !== null
      ? (timeToMinutes(previewEndTime) - startMinutes) * pxPerMinute
      : null;

  const handleCardClick = () => {
    if (isDragging || isPopoverDisabled) return;
    setPopoverOpen((o) => !o);
  };

  const card = (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-appointment-card="true"
      className={`relative h-full ${isDragging ? "opacity-50 cursor-grabbing" : "cursor-grab"}`}
      style={
        previewHeightPx !== null ? { height: `${previewHeightPx}px` } : undefined
      }
    >
      <AppointmentCard
        startTime={startTime}
        endTime={displayEndTime}
        patientName={patientName}
        treatmentName={treatmentName}
        status={status}
        color={color}
        tags={tags}
        indicators={indicators}
        onClick={handleCardClick}
      />
      {onResize && status !== "blocked" && (
        <div
          onPointerDown={handleResizeStart}
          onMouseDown={(e) => e.stopPropagation()}
          data-resize-handle="true"
          className="group/resize absolute bottom-0 left-0 right-0 z-20 h-2.5 cursor-ns-resize"
          aria-label="Resize appointment"
          title="Drag to resize"
        >
          <div className="absolute bottom-0.5 left-1/2 h-0.5 w-7 -translate-x-1/2 rounded-full bg-foreground/30 transition-colors group-hover/resize:bg-foreground/70" />
        </div>
      )}
    </div>
  );

  if (isPopoverDisabled) return card;

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverAnchor asChild>{card}</PopoverAnchor>
      <PopoverContent
        className="w-[553px] p-4"
        align="start"
        side="right"
        sideOffset={8}
        collisionPadding={12}
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Keep the popover open when focus leaves the window (e.g. the user
        // activates a screenshot tool like Snipping Tool); otherwise the
        // preview disappears before it can be captured.
        onFocusOutside={(e) => e.preventDefault()}
        // Popover content is portaled in the DOM but still part of the React
        // tree, so React synthetic events bubble through to the calendar grid's
        // onMouseDown handler and trigger a "create appointment" slot click.
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <AppointmentPreviewContent
          appointmentId={_id}
          onClose={() => setPopoverOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
