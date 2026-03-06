import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface SidebarSlotContextValue {
  content: ReactNode | null;
  setContent: (node: ReactNode | null) => void;
  wideContent: boolean;
  setWideContent: (wide: boolean) => void;
}

const SidebarSlotContext = createContext<SidebarSlotContextValue>({
  content: null,
  setContent: () => {},
  wideContent: false,
  setWideContent: () => {},
});

export function SidebarSlotProvider({ children }: { children: ReactNode }) {
  const [content, setContentState] = useState<ReactNode | null>(null);
  const [wideContent, setWideContentState] = useState(false);

  const setContent = useCallback((node: ReactNode | null) => {
    setContentState(node);
  }, []);

  const setWideContent = useCallback((wide: boolean) => {
    setWideContentState(wide);
  }, []);

  return (
    <SidebarSlotContext.Provider value={{ content, setContent, wideContent, setWideContent }}>
      {children}
    </SidebarSlotContext.Provider>
  );
}

export const useSidebarSlot = () => useContext(SidebarSlotContext);
