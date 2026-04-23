import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { BarRanking } from "../bar-ranking";
import { useTranslation } from "react-i18next";

export function GabinetPackagesWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const getPackagesKpis = useAction(api.gabinet.sidebarWidgets.getPackagesKpis);
  const getTopTreatments = useAction(api.gabinet.sidebarWidgets.getTopTreatments);
  const { data: kpis } = useQuery({
    queryKey: ["gabinet.sidebarWidgets.getPackagesKpis", organizationId],
    queryFn: () => getPackagesKpis({ organizationId }),
    enabled: !!organizationId,
  });
  const { data: topTreatments } = useQuery({
    queryKey: ["gabinet.sidebarWidgets.getTopTreatments", organizationId],
    queryFn: () => getTopTreatments({ organizationId }),
    enabled: !!organizationId,
  });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.gabinet.totalPackages"), value: kpis.totalPackages, color: "text-primary" },
          { label: t("sidebar.gabinet.activePackages"), value: kpis.activePackages, color: "text-emerald-500" },
        ]}
      />
      <KpiRow
        items={[
          {
            label: t("sidebar.gabinet.expiringPackages"),
            value: kpis.expiringPackages,
            color: kpis.expiringPackages > 0 ? "text-amber-500" : undefined,
          },
        ]}
      />

      {/* Top treatments for context */}
      {topTreatments && topTreatments.length > 0 && <BarRanking items={topTreatments} />}
    </>
  );
}
