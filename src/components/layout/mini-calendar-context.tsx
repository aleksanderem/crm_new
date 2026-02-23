import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { CalendarDate } from "@internationalized/date";

interface MiniCalendarState {
  visible: boolean;
  selectedDate: CalendarDate | null;
  highlightedDates: Set<string>;
  onDateChange: ((date: CalendarDate) => void) | null;
}

interface MiniCalendarContextValue {
  state: MiniCalendarState;
  show: (selectedDate: CalendarDate | null, highlightedDates: Set<string>, onDateChange: (date: CalendarDate) => void) => void;
  hide: () => void;
  updateSelectedDate: (date: CalendarDate | null) => void;
}

const defaultState: MiniCalendarState = {
  visible: false,
  selectedDate: null,
  highlightedDates: new Set(),
  onDateChange: null,
};

const MiniCalendarContext = createContext<MiniCalendarContextValue>({
  state: defaultState,
  show: () => {},
  hide: () => {},
  updateSelectedDate: () => {},
});

export function MiniCalendarProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MiniCalendarState>(defaultState);

  const show = useCallback(
    (selectedDate: CalendarDate | null, highlightedDates: Set<string>, onDateChange: (date: CalendarDate) => void) => {
      setState({ visible: true, selectedDate, highlightedDates, onDateChange });
    },
    [],
  );

  const hide = useCallback(() => {
    setState(defaultState);
  }, []);

  const updateSelectedDate = useCallback((date: CalendarDate | null) => {
    setState((prev) => (prev.visible ? { ...prev, selectedDate: date } : prev));
  }, []);

  return (
    <MiniCalendarContext.Provider value={{ state, show, hide, updateSelectedDate }}>
      {children}
    </MiniCalendarContext.Provider>
  );
}

export const useMiniCalendar = () => useContext(MiniCalendarContext);
