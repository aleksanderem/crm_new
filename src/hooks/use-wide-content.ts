import { useEffect } from "react";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";

/**
 * Hook to indicate that the current page has wide content that needs more space.
 * This will automatically hide Column 2 sidebar on screens 1024-1400px.
 * 
 * @example
 * ```tsx
 * function CalendarPage() {
 *   useWideContent(true);
 *   return <WeeklyCalendar />;
 * }
 * ```
 */
export function useWideContent(wide: boolean = true) {
  const { setWideContent } = useSidebarSlot();

  useEffect(() => {
    setWideContent(wide);
    return () => setWideContent(false); // Reset on unmount
  }, [wide, setWideContent]);
}
