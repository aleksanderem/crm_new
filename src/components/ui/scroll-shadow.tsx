import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ScrollShadowProps {
  children: ReactNode;
  className?: string;
}

/**
 * Lightweight scroll container with fade shadows at top/bottom edges.
 * Pure CSS + scroll event listener. No external deps.
 */
export function ScrollShadow({ children, className }: ScrollShadowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  const updateShadows = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setShowTop(scrollTop > 8);
    setShowBottom(scrollTop + clientHeight < scrollHeight - 8);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    updateShadows();
    el.addEventListener("scroll", updateShadows, { passive: true });
    const obs = new ResizeObserver(updateShadows);
    obs.observe(el);
    return () => {
      el.removeEventListener("scroll", updateShadows);
      obs.disconnect();
    };
  }, [updateShadows]);

  return (
    <div className={cn("relative", className?.includes("flex-1") && "flex-1", className?.includes("min-h-0") && "min-h-0")}>
      {/* Top shadow */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-background to-transparent transition-opacity duration-200",
          showTop ? "opacity-100" : "opacity-0",
        )}
      />
      {/* Scroll container */}
      <div
        ref={ref}
        className={cn("h-full overflow-y-auto", className)}
      >
        {children}
      </div>
      {/* Bottom shadow */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-background to-transparent transition-opacity duration-200",
          showBottom ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
