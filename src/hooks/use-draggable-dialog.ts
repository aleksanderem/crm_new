import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Extracted from `AppointmentDialog` (issues #977, #1281, #1424, #1426, #1459)
// so the same drag-from-anywhere behaviour can be reused by other small
// centered dialogs on the calendar workflow (issue #1548). The hook assumes
// the target is rendered by shadcn `DialogContent`, whose default class adds
// `translate-x-[-50%] translate-y-[-50%]` (compiled to the modern `translate:`
// CSS property). The inline value composes additively with `transform:`, so
// writing to `el.style.translate` overrides only the class translate without
// disturbing other transforms.
const DRAG_HEADER_VISIBLE = 60;
const DRAG_CORNER_VISIBLE = 80;

const INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, [role="button"], [role="combobox"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [contenteditable="true"], [data-radix-popper-content-wrapper]';

export interface UseDraggableDialogResult {
  contentRef: React.RefObject<HTMLDivElement>;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  isDragging: boolean;
}

export function useDraggableDialog(open: boolean): UseDraggableDialogResult {
  const offsetRef = useRef({ x: 0, y: 0 });
  const contentRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const apply = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const { x, y } = offsetRef.current;
    el.style.translate =
      x === 0 && y === 0
        ? ""
        : `calc(-50% + ${x}px) calc(-50% + ${y}px)`;
  }, []);

  const clamp = useCallback((x: number, y: number) => {
    const el = contentRef.current;
    if (!el || typeof window === "undefined") return { x, y };
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let minY = h / 2 - vh / 2;
    let maxY = vh / 2 + h / 2 - DRAG_HEADER_VISIBLE;
    if (minY > maxY) minY = maxY = h / 2 - vh / 2;
    let minX = DRAG_CORNER_VISIBLE - vw / 2 - w / 2;
    let maxX = vw / 2 + w / 2 - DRAG_CORNER_VISIBLE;
    if (minX > maxX) minX = maxX = 0;
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }, []);

  // Reapply on every render so unrelated re-renders mid-drag don't snap the
  // dialog back to its class-defined centered translate (issue #1424).
  useLayoutEffect(() => {
    apply();
  });

  useEffect(() => {
    if (!open) {
      offsetRef.current = { x: 0, y: 0 };
      setIsDragging(false);
    }
  }, [open]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      // Skip touch input: on mobile the dialog is full-width so drag is not
      // useful, and capturing touch pointerdown would block native scrolling
      // of the now-scrollable DialogContent (issue #1462).
      if (e.pointerType === "touch") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest(INTERACTIVE_SELECTOR)) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startOffset = { ...offsetRef.current };
      setIsDragging(true);

      let rafId: number | null = null;
      const flush = () => {
        rafId = null;
        apply();
      };

      const handleMove = (ev: PointerEvent) => {
        offsetRef.current = clamp(
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
        apply();
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        setIsDragging(false);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [apply, clamp],
  );

  return { contentRef, onPointerDown, isDragging };
}
