import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";

interface SidebarSlotContextValue {
  content: ReactNode | null;
  setContent: (node: ReactNode | null) => void;
  wideContent: boolean;
  setWideContent: (wide: boolean) => void;
  dayAgendaDate: string | null;
  setDayAgendaDate: (d: string | null) => void;
}

const SidebarSlotContext = createContext<SidebarSlotContextValue>({
  content: null,
  setContent: () => {},
  wideContent: false,
  setWideContent: () => {},
  dayAgendaDate: null,
  setDayAgendaDate: () => {},
});

export function SidebarSlotProvider({ children }: { children: ReactNode }) {
  const [content, setContentState] = useState<ReactNode | null>(null);
  const [wideContent, setWideContentState] = useState(false);
  const [dayAgendaDate, setDayAgendaDateState] = useState<string | null>(null);
  const location = useLocation();

  const setContent = useCallback((node: ReactNode | null) => {
    setContentState(node);
  }, []);

  const setWideContent = useCallback((wide: boolean) => {
    setWideContentState(wide);
  }, []);

  const setDayAgendaDate = useCallback((d: string | null) => {
    setDayAgendaDateState(d);
  }, []);

  // Clear slot content and day agenda on route change
  useEffect(() => {
    setContentState(null);
    setDayAgendaDateState(null);
  }, [location.pathname]);

  return (
    <SidebarSlotContext.Provider
      value={{ content, setContent, wideContent, setWideContent, dayAgendaDate, setDayAgendaDate }}
    >
      {children}
    </SidebarSlotContext.Provider>
  );
}

export const useSidebarSlot = () => useContext(SidebarSlotContext);
