import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface HeaderSlotContextValue {
  backAction: (() => void) | null;
  setBackAction: (action: (() => void) | null) => void;
}

const HeaderSlotContext = createContext<HeaderSlotContextValue>({
  backAction: null,
  setBackAction: () => {},
});

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [backAction, setBackActionState] = useState<(() => void) | null>(null);

  const setBackAction = useCallback((action: (() => void) | null) => {
    setBackActionState(() => action);
  }, []);

  return (
    <HeaderSlotContext.Provider value={{ backAction, setBackAction }}>
      {children}
    </HeaderSlotContext.Provider>
  );
}

export function useHeaderSlot() {
  return useContext(HeaderSlotContext);
}

export function HeaderBackButton() {
  const { backAction } = useHeaderSlot();
  if (!backAction) return null;
  return (
    <button
      onClick={backAction}
      className="inline-flex items-center justify-center rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground h-7 w-7 shrink-0"
      aria-label="Back"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
    </button>
  );
}
