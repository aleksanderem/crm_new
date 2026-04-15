import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useMatchRoute } from "@tanstack/react-router";

export interface NudgeData {
  message: string;
  messageValues?: Record<string, string | number>;
  severity: "red" | "yellow" | "green";
  icon?: string;
}

interface NudgesContextValue {
  nudges: NudgeData[];
  totalCount: number;
  redCount: number;
  yellowCount: number;
  greenCount: number;
  isLoading: boolean;
  refreshNudges: () => void;
}

const NudgesContext = createContext<NudgesContextValue | undefined>(undefined);

export function NudgesProvider({ children }: { children: React.ReactNode }) {
  const { organizationId } = useOrganization();
  const matchRoute = useMatchRoute();
  const isGabinetRoute = !!matchRoute({ to: "/dashboard/gabinet", fuzzy: true });

  const [nudges, setNudges] = useState<NudgeData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch CRM nudges
  const { data: crmNudges, isLoading: crmLoading } = useQuery({
    ...convexQuery(api.nudges.getAll, {
      organizationId,
    }),
    enabled: !!organizationId && !isGabinetRoute,
  });

  // Fetch Gabinet nudges
  const { data: gabinetNudges, isLoading: gabinetLoading } = useQuery({
    ...convexQuery(api.gabinet.nudges.getAll, {
      organizationId,
    }),
    enabled: !!organizationId && isGabinetRoute,
  });

  // Aggregate nudges based on current route
  useEffect(() => {
    setIsLoading(crmLoading || gabinetLoading);
    const sourceNudges = isGabinetRoute ? gabinetNudges : crmNudges;
    setNudges(sourceNudges ?? []);
  }, [crmNudges, gabinetNudges, isGabinetRoute, crmLoading, gabinetLoading]);

  const totalCount = nudges.length;
  const redCount = nudges.filter(n => n.severity === "red").length;
  const yellowCount = nudges.filter(n => n.severity === "yellow").length;
  const greenCount = nudges.filter(n => n.severity === "green").length;

  const refreshNudges = useCallback(() => {
    // This will trigger a refetch through the query client
    window.dispatchEvent(new CustomEvent('refresh-nudges'));
  }, []);

  return (
    <NudgesContext.Provider
      value={{
        nudges,
        totalCount,
        redCount,
        yellowCount,
        greenCount,
        isLoading,
        refreshNudges,
      }}
    >
      {children}
    </NudgesContext.Provider>
  );
}

export function useNudges() {
  const context = useContext(NudgesContext);
  if (context === undefined) {
    throw new Error("useNudges must be used within a NudgesProvider");
  }
  return context;
}
