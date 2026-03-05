import { createContext, useContext, useEffect, useRef } from "react";

export interface SidebarDispatch {
  id: string;
  seq: number;
}

interface SidebarActionsContextValue {
  openQuickCreate: (type: string) => void;
  navigateTo: (href: string) => void;
  dispatch: (actionId: string) => void;
  lastDispatch: SidebarDispatch | null;
}

export const SidebarActionsContext = createContext<SidebarActionsContextValue>({
  openQuickCreate: () => {},
  navigateTo: () => {},
  dispatch: () => {},
  lastDispatch: null,
});

export function useSidebarActions() {
  return useContext(SidebarActionsContext);
}

/**
 * React to a sidebar action dispatch in a page component.
 *
 * @example
 * useSidebarDispatch("openFilter", () => setFilterOpen(true));
 * useSidebarDispatch("importCsv", () => setImportDialogOpen(true));
 */
export function useSidebarDispatch(actionId: string, handler: () => void) {
  const { lastDispatch } = useSidebarActions();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const seenRef = useRef(0);

  useEffect(() => {
    if (lastDispatch && lastDispatch.id === actionId && lastDispatch.seq > seenRef.current) {
      seenRef.current = lastDispatch.seq;
      handlerRef.current();
    }
  }, [lastDispatch, actionId]);
}
