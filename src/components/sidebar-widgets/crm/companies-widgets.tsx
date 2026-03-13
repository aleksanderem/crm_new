import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { useTranslation } from "react-i18next";

export function CompaniesWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getCompaniesKpis, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <KpiRow
      items={[
        { label: t("sidebar.total"), value: kpis.total },
        { label: t("sidebar.newThisMonth"), value: kpis.newThisMonth },
        { label: t("sidebar.revenue"), value: kpis.totalRevenue >= 1000 ? `${Math.round(kpis.totalRevenue / 1000)}K` : kpis.totalRevenue },
      ]}
    />
  );
}
