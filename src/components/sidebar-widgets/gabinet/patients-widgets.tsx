import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { RecentItems } from "../recent-items";
import { BarRanking } from "../bar-ranking";
import { useTranslation } from "react-i18next";

export function GabinetPatientsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const getPatientsKpis = useAction(api.gabinet.sidebarWidgets.getPatientsKpis);
  const getTopTreatments = useAction(api.gabinet.sidebarWidgets.getTopTreatments);
  const { data: kpis } = useQuery({
    queryKey: ["gabinet.sidebarWidgets.getPatientsKpis", organizationId],
    queryFn: () => getPatientsKpis({ organizationId }),
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
          { label: t("sidebar.gabinet.total"), value: kpis.total, color: "text-primary" },
          { label: t("sidebar.gabinet.newThisMonth"), value: kpis.newThisMonth, color: "text-emerald-500" },
        ]}
      />

      {/* Top treatments */}
      {topTreatments && topTreatments.length > 0 && <BarRanking items={topTreatments} />}

      {/* Recent patients */}
      <RecentItems organizationId={organizationId} entityType="gabinetPatients" linkPrefix="/dashboard/gabinet/patients/" />
    </>
  );
}
