import { createContext, useContext, useState, ReactNode } from "react";
import { Id } from "@cvx/_generated/dataModel";

export const getOrgStorageKey = (userId: string) => `quera-active-org-${userId}`;

interface OrgContextType {
  organizationId: Id<"organizations"> | null;
}

const OrgContext = createContext<OrgContextType | null>(null);

export function OrgProvider({
  children,
  initialOrgId,
}: {
  children: ReactNode;
  initialOrgId?: Id<"organizations">;
}) {
  const [organizationId] =
    useState<Id<"organizations"> | null>(initialOrgId ?? null);

  return (
    <OrgContext.Provider value={{ organizationId }}>
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
  };
}
