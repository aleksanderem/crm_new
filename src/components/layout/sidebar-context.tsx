import { createContext, useContext } from "react";

interface SidebarActionsContextValue {
  openQuickCreate: (type: string) => void;
  navigateTo: (href: string) => void;
}

export const SidebarActionsContext = createContext<SidebarActionsContextValue>({
  openQuickCreate: () => {},
  navigateTo: () => {},
});

export function useSidebarActions() {
  return useContext(SidebarActionsContext);
}
