import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { BarRanking } from "../bar-ranking";
import { RecentItems } from "../recent-items";
import { useTranslation } from "react-i18next";

export function GabinetTreatmentsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const getTreatmentsKpis = useAction(api.gabinet.sidebarWidgets.getTreatmentsKpis);
  const getTopTreatments = useAction(api.gabinet.sidebarWidgets.getTopTreatments);
  const { data: kpis } = useQuery({
    queryKey: ["gabinet.sidebarWidgets.getTreatmentsKpis", organizationId],
    queryFn: () => getTreatmentsKpis({ organizationId }),
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
          { label: t("sidebar.gabinet.totalTreatments"), value: kpis.totalTreatments, color: "text-primary" },
          { label: t("sidebar.gabinet.completedThisMonth"), value: kpis.completedThisMonth, color: "text-emerald-500" },
        ]}
      />
      <KpiRow
        items={[
          {
            label: t("sidebar.gabinet.popularTreatment"),
            value: kpis.popularTreatment ?? "—",
          },
        ]}
      />

      {/* Top treatments ranking */}
      {topTreatments && topTreatments.length > 0 && <BarRanking items={topTreatments} />}

      {/* Recent treatments */}
      <RecentItems organizationId={organizationId} entityType="gabinetTreatments" linkPrefix="/dashboard/gabinet/treatments/" />
    </>
  );
}
