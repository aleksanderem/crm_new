import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Id } from "@cvx/_generated/dataModel";

export const LS_ACTIVE_ORG_KEY = "quera-active-org-id";

interface OrgContextType {
  organizationId: Id<"organizations"> | null;
  setOrganizationId: (id: Id<"organizations">) => void;
}

const OrgContext = createContext<OrgContextType | null>(null);

export function OrgProvider({
  children,
  initialOrgId,
}: {
  children: ReactNode;
  initialOrgId?: Id<"organizations">;
}) {
  const [organizationId, _setOrganizationId] =
    useState<Id<"organizations"> | null>(initialOrgId ?? null);

  const setOrganizationId = useCallback((id: Id<"organizations">) => {
    localStorage.setItem(LS_ACTIVE_ORG_KEY, id);
    _setOrganizationId(id);
  }, []);

  return (
    <OrgContext.Provider value={{ organizationId, setOrganizationId }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrganization() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrganization must be used within OrgProvider");
  if (!ctx.organizationId) throw new Error("No organization selected");
  return {
    organizationId: ctx.organizationId,
    setOrganizationId: ctx.setOrganizationId,
  };
}
