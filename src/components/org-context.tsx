import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Id } from "@cvx/_generated/dataModel";

export const getOrgStorageKey = (userId: string) => `quera-active-org-${userId}`;

interface OrgContextType {
  organizationId: Id<"organizations"> | null;
  setOrganizationId: (id: Id<"organizations">) => void;
}

const OrgContext = createContext<OrgContextType | null>(null);

export function OrgProvider({
  children,
  initialOrgId,
  userId,
}: {
  children: ReactNode;
  initialOrgId?: Id<"organizations">;
  userId?: string;
}) {
  const [organizationId, _setOrganizationId] =
    useState<Id<"organizations"> | null>(initialOrgId ?? null);

  const setOrganizationId = useCallback((id: Id<"organizations">) => {
    if (userId) {
      localStorage.setItem(getOrgStorageKey(userId), id);
    }
    _setOrganizationId(id);
  }, [userId]);

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
