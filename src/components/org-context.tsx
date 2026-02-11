import { createContext, useContext, useState, ReactNode } from "react";
import { Id } from "@cvx/_generated/dataModel";

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
  const [organizationId, setOrganizationId] =
    useState<Id<"organizations"> | null>(initialOrgId ?? null);
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
