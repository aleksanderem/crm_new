import { useDraggable } from "@dnd-kit/core";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  AppointmentCard,
  type AppointmentTag,
} from "./appointment-card";
import type { AppointmentIndicator } from "./appointment-indicators";
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

  // Drag-to-reposition state for the preview popover (issue #1476). Same
  // pattern as the AppointmentDialog drag added in #1459, adapted for the
  // popover positioning model: the wrapper (`data-radix-popper-content-wrapper`)
  // owns the anchor position via its own inline `transform: translate3d(…)`, so
  // we write the drag offset to the popover content element's `translate:`
  // CSS property. The two properties are independent and compose additively,
  // so the popup follows the cursor without disturbing Radix's collision /
  // flipping logic.
  const previewContentRef = useRef<HTMLDivElement | null>(null);
  const previewDragOffsetRef = useRef({ x: 0, y: 0 });
  const [isPreviewDragging, setIsPreviewDragging] = useState(false);

  const applyPreviewDragTransform = useCallback(() => {
    const el = previewContentRef.current;
    if (!el) return;
    const { x, y } = previewDragOffsetRef.current;
    el.style.translate = x === 0 && y === 0 ? "" : `${x}px ${y}px`;
  }, []);

  // Clamp the offset so the popover header (close button + status badge) can
  // never be dragged fully off-screen. Without this, a small drag can park the
  // popup where the user can no longer grab or close it — same protection the
  // dialog grew in #1426.
  const clampPreviewDragOffset = useCallback((x: number, y: number) => {
    const el = previewContentRef.current;
    if (!el || typeof window === "undefined") return { x, y };
    const rect = el.getBoundingClientRect();
    const baseLeft = rect.left - previewDragOffsetRef.current.x;
    const baseTop = rect.top - previewDragOffsetRef.current.y;
    const w = rect.width;
    const h = rect.height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const HEADER_VISIBLE = 60;
    const CORNER_VISIBLE = 80;
    const minX = CORNER_VISIBLE - baseLeft - w;
    const maxX = vw - CORNER_VISIBLE - baseLeft;
    const minY = HEADER_VISIBLE - baseTop - h;
    const maxY = vh - HEADER_VISIBLE - baseTop;
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }, []);

  // Reapply on every render so an unrelated re-render mid-drag doesn't snap
  // the popover back to its base position.
  useLayoutEffect(() => {
    applyPreviewDragTransform();
  });

  useEffect(() => {
    if (!popoverOpen) {
      previewDragOffsetRef.current = { x: 0, y: 0 };
      setIsPreviewDragging(false);
    }
  }, [popoverOpen]);

  const handlePreviewDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      // Skip touch input to mirror the dialog's choice (#1459): on mobile the
      // popover is near full-width and capturing touch pointerdown here would
      // block native vertical scrolling of the popover body.
      if (e.pointerType === "touch") return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          'button, a, input, textarea, select, [role="button"], [role="combobox"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [contenteditable="true"], [data-radix-popper-content-wrapper]',
        )
      ) {
        return;
      }
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startOffset = { ...previewDragOffsetRef.current };
      setIsPreviewDragging(true);

      let rafId: number | null = null;
      const flush = () => {
        rafId = null;
        applyPreviewDragTransform();
      };

      const handleMove = (ev: PointerEvent) => {
        previewDragOffsetRef.current = clampPreviewDragOffset(
          startOffset.x + (ev.clientX - startX),
          startOffset.y + (ev.clientY - startY),
        );
        if (rafId === null) rafId = requestAnimationFrame(flush);
      };

      const handleUp = () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        applyPreviewDragTransform();
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        setIsPreviewDragging(false);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [applyPreviewDragTransform, clampPreviewDragOffset],
  );

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
        ref={previewContentRef}
        className={cn(
          "w-[553px] max-w-[calc(100vw-24px)] max-h-[calc(100dvh-24px)] overflow-y-auto p-4",
          isPreviewDragging && "cursor-grabbing select-none",
        )}
        align="start"
        side="right"
        sideOffset={8}
        collisionPadding={12}
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Keep the popover open when focus leaves the window (e.g. the user
        // activates a screenshot tool like Snipping Tool); otherwise the
        // preview disappears before it can be captured.
        onFocusOutside={(e) => e.preventDefault()}
        // Drag-from-anywhere (issue #1476): clicking on the popup body (away
        // from any interactive control) initiates a reposition drag so the
        // user can peek at the appointment underneath.
        onPointerDown={handlePreviewDragStart}
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
