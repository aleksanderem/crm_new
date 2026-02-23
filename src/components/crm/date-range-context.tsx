import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { DateRange } from "react-day-picker";
import type { TimeRange } from "./types";

export interface DateRangeContextValue {
  /** The currently selected preset, or "custom" when a calendar range is picked */
  timeRange: TimeRange;
  /** The resolved from/to dates (computed from preset or set directly) */
  dateRange: DateRange | undefined;
  /** Select a preset – also computes the matching dateRange */
  setPreset: (range: TimeRange) => void;
  /** Select an arbitrary calendar range – sets timeRange to "all" as fallback for queries */
  setCustomRange: (range: DateRange | undefined) => void;
}

const DateRangeContext = createContext<DateRangeContextValue | null>(null);

function presetToDateRange(preset: TimeRange): DateRange | undefined {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "last7days":
      return { from: new Date(today.getTime() - 6 * 86_400_000), to: today };
    case "last30days":
      return { from: new Date(today.getTime() - 29 * 86_400_000), to: today };
    case "thisMonth":
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
    case "last3months":
      return { from: new Date(today.getTime() - 89 * 86_400_000), to: today };
    case "thisYear":
      return { from: new Date(today.getFullYear(), 0, 1), to: today };
    case "all":
      return undefined;
  }
}

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [timeRange, setTimeRange] = useState<TimeRange>("last30days");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    () => presetToDateRange("last30days"),
  );

  const setPreset = useCallback((range: TimeRange) => {
    setTimeRange(range);
    setDateRange(presetToDateRange(range));
  }, []);

  const setCustomRange = useCallback((range: DateRange | undefined) => {
    setTimeRange("all");
    setDateRange(range);
  }, []);

  const value = useMemo(
    () => ({ timeRange, dateRange, setPreset, setCustomRange }),
    [timeRange, dateRange, setPreset, setCustomRange],
  );

  return (
    <DateRangeContext.Provider value={value}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange(): DateRangeContextValue {
  const ctx = useContext(DateRangeContext);
  if (!ctx) {
    throw new Error("useDateRange must be used within a DateRangeProvider");
  }
  return ctx;
}
