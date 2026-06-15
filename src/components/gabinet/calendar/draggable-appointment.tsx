import { useDraggable } from "@dnd-kit/core";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
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
  employeeCount?: number;
  employeeNames?: string[];
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
  employeeCount,
  employeeNames,
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

  const { t } = useTranslation();
  const [previewEndTime, setPreviewEndTime] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const isMobile = useIsMobile();
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
      // Skip touch — on iOS the popover content scrolls natively (issue #1769)
      // and body-wide drag-from-anywhere only worked by suppressing that scroll
      // (#1756), which made tall content unreachable on small phones. Mobile
      // users drag via the grab pill at the top (which has its own touch-none).
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

  // Drag handle variant (issue #1626): the bar at the top of the popover.
  // The body-wide handler now accepts touch too (issue #1741) so the bar is
  // no longer the only touch drag affordance, but it's kept as a visual cue
  // (matches the iOS-style grab pill on the create dialog) and because its
  // `touch-none` class guarantees the drag wins over native scroll there.
  const handlePreviewHandleDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
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
      // `touch-none` keeps iOS from preempting the touch as a scroll gesture
      // before the TouchSensor's 200ms press-and-hold activation can fire
      // (issue #1766). The original fix paired this with a distance-based
      // PointerSensor, but that meant any micro-movement during a tap looked
      // like a drag and users could never reach the preview popover — see the
      // delay-based TouchSensor in `_layout.gabinet.calendar.index.lazy.tsx`
      // that now disambiguates quick taps (→ click → preview) from holds (→
      // drag). Desktop is unaffected — `touch-action` only gates touch input.
      className={`relative h-full touch-none ${isDragging ? "opacity-50 cursor-grabbing" : "cursor-grab"}`}
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
        employeeCount={employeeCount}
        employeeNames={employeeNames}
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
      {/* Backdrop — dims the busy calendar grid behind the preview so the
          popover establishes itself as a modal surface (issue #1738). The
          backdrop sits below the popover (z-40 vs Popover's z-50). Clicking
          it bubbles to Radix's outside-click detector which closes the
          popover; drag-to-peek (#1476) still works because the body-drag
          handler on PopoverContent fires first on its own surface.

          The backdrop is portaled to document.body but stays in the React
          tree, so React synthetic events bubble up through Popover →
          DraggableAppointment → the calendar slot, which would trigger the
          grid's onMouseDown drag-to-create handler and open the new-
          appointment dialog (issue #1797). Stop the synthetic events here —
          the native DOM event still reaches Radix's document-level
          outside-click listener, so the popover continues to close. */}
      {popoverOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-hidden
              className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px] animate-in fade-in-0 duration-150"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />,
            document.body,
          )
        : null}
      <PopoverContent
        ref={previewContentRef}
        // Touch scrolling is left on so users on small phones can reach all the
        // content inside the popover (issue #1769). The earlier `touch-none`
        // (#1756) made body-drag win over native scroll on iOS, but it also
        // made tall content unreadable. Drag-to-peek is now touch-driven only
        // via the grab pill at the top, which has its own `touch-none` zone.
        className={cn(
          "w-[553px] max-w-[calc(100vw-24px)] max-h-[calc(100dvh-24px)] overflow-y-auto p-0 rounded-xl border-border/60 shadow-2xl",
          isPreviewDragging && "cursor-grabbing select-none",
        )}
        // On mobile the appointment can sit on either side of the screen, and a
        // 378px popover does not fit beside it. Anchor it to the bottom of the
        // card and center horizontally so the whole preview stays on-screen;
        // Radix will flip to "top" if there is no room below (issue #1566).
        align={isMobile ? "center" : "start"}
        side={isMobile ? "bottom" : "right"}
        sideOffset={8}
        collisionPadding={12}
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Keep the popover open when focus leaves the window (e.g. the user
        // activates a screenshot tool like Snipping Tool); otherwise the
        // preview disappears before it can be captured.
        onFocusOutside={(e) => e.preventDefault()}
        // Drag-from-anywhere (#1476, extended to touch in #1741): pressing on
        // the popup body away from any interactive control initiates a
        // reposition drag so the user can peek at the appointment underneath.
        onPointerDown={handlePreviewDragStart}
        // Popover content is portaled in the DOM but still part of the React
        // tree, so React synthetic events bubble through to the calendar grid's
        // onMouseDown handler and trigger a "create appointment" slot click.
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* No dedicated drag bar (issue #1738 follow-up): the previous strip
            broke the header rhythm and floated over the popover edge. The
            touch drag handler is wired into the title row inside
            AppointmentPreviewContent (`titleDragHandler`), where it
            piggy-backs on the title bar so touch users can still reposition
            the popover (#1626) without an extra visual element. Desktop mouse
            users keep drag-from-anywhere via the body handler on
            PopoverContent (#1476). */}
        <AppointmentPreviewContent
          appointmentId={_id}
          onClose={() => setPopoverOpen(false)}
          titleDragHandler={handlePreviewHandleDragStart}
          isPreviewDragging={isPreviewDragging}
          dragToMoveLabel={t("gabinet.appointments.dragToMove", "Przeciągnij, aby przesunąć")}
        />
      </PopoverContent>
    </Popover>
  );
}
