import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { useTranslation } from "react-i18next";

export function GabinetTreatmentsWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.gabinet.sidebarWidgets.getTreatmentsKpis, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <KpiRow
      items={[
        { label: t("sidebar.gabinet.totalTreatments"), value: kpis.totalTreatments },
        { label: t("sidebar.gabinet.completedThisMonth"), value: kpis.completedThisMonth },
        {
          label: t("sidebar.gabinet.popularTreatment"),
          value: kpis.popularTreatment ?? "—",
        },
      ]}
    />
  );
}
