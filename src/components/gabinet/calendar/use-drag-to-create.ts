import { useCallback, useRef, useState } from "react";

interface UseDragToCreateOptions {
  hoursStart: number;
  hoursCount: number;
  hourHeight: number;
  snapMinutes: number;
  minDragDistance: number;
  onClick: (time: string) => void;
  onDragSelect: (startTime: string, endTime: string) => void;
}

export interface DragRange {
  start: number;
  end: number;
}

export function useDragToCreate({
  hoursStart,
  hoursCount,
  hourHeight,
  snapMinutes,
  minDragDistance,
  onClick,
  onDragSelect,
}: UseDragToCreateOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragRange, setDragRange] = useState<DragRange | null>(null);

  const yToSnappedTime = useCallback(
    (y: number) => {
      const totalHeight = hoursCount * hourHeight;
      const clamped = Math.max(0, Math.min(totalHeight, y));
      const totalMinutes =
        Math.round(((clamped / hourHeight) * 60) / snapMinutes) * snapMinutes;
      const h = Math.floor(totalMinutes / 60) + hoursStart;
      const m = totalMinutes % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    },
    [hoursStart, hoursCount, hourHeight, snapMinutes],
  );

  const yToHourTime = useCallback(
    (y: number) => {
      const totalHeight = hoursCount * hourHeight;
      const clamped = Math.max(0, Math.min(totalHeight - 1, y));
      const hour = Math.floor(clamped / hourHeight) + hoursStart;
      return `${String(hour).padStart(2, "0")}:00`;
    },
    [hoursStart, hoursCount, hourHeight],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-appointment-card]")) return;
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const startY = e.clientY - rect.top;
      setDragRange({ start: startY, end: startY });

      const handleMove = (ev: MouseEvent) => {
        if (!containerRef.current) return;
        const r = containerRef.current.getBoundingClientRect();
        const y = ev.clientY - r.top;
        setDragRange({ start: startY, end: y });
      };

      const handleUp = (ev: MouseEvent) => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        setDragRange(null);
        if (!containerRef.current) return;
        const r = containerRef.current.getBoundingClientRect();
        const endY = ev.clientY - r.top;
        const distance = Math.abs(endY - startY);
        if (distance >= minDragDistance) {
          const minY = Math.min(startY, endY);
          const maxY = Math.max(startY, endY);
          const startTime = yToSnappedTime(minY);
          const endTime = yToSnappedTime(maxY);
          if (startTime !== endTime) {
            onDragSelect(startTime, endTime);
            return;
          }
        }
        onClick(yToHourTime(startY));
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [minDragDistance, yToSnappedTime, yToHourTime, onClick, onDragSelect],
  );

  return {
    containerRef,
    dragRange,
    handleMouseDown,
  };
}
