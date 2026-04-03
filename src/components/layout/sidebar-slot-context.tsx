import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";

interface SidebarSlotContextValue {
  content: ReactNode | null;
  setContent: (node: ReactNode | null) => void;
  wideContent: boolean;
  setWideContent: (wide: boolean) => void;
  dayAgendaDate: string | null;
  setDayAgendaDate: (d: string | null) => void;
  shellSidebarMode: "default" | "icon-only";
  setShellSidebarMode: (mode: "default" | "icon-only") => void;
}

const SidebarSlotContext = createContext<SidebarSlotContextValue>({
  content: null,
  setContent: () => {},
  wideContent: false,
  setWideContent: () => {},
  dayAgendaDate: null,
  setDayAgendaDate: () => {},
  shellSidebarMode: "default",
  setShellSidebarMode: () => {},
});

export function SidebarSlotProvider({ children }: { children: ReactNode }) {
  const [content, setContentState] = useState<ReactNode | null>(null);
  const [wideContent, setWideContentState] = useState(false);
  const [dayAgendaDate, setDayAgendaDateState] = useState<string | null>(null);
  const [shellSidebarMode, setShellSidebarModeState] = useState<"default" | "icon-only">("default");
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

  const setShellSidebarMode = useCallback((mode: "default" | "icon-only") => {
    setShellSidebarModeState(mode);
  }, []);

  // Clear slot content and day agenda on route change
  useEffect(() => {
    setContentState(null);
    setDayAgendaDateState(null);
  }, [location.pathname]);

  return (
    <SidebarSlotContext.Provider
      value={{
        content,
        setContent,
        wideContent,
        setWideContent,
        dayAgendaDate,
        setDayAgendaDate,
        shellSidebarMode,
        setShellSidebarMode,
      }}
    >
      {children}
    </SidebarSlotContext.Provider>
  );
}

export const useSidebarSlot = () => useContext(SidebarSlotContext);
