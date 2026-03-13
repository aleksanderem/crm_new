import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { RecentItems } from "../recent-items";
import { useTranslation } from "react-i18next";

export function GabinetPatientsWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.gabinet.sidebarWidgets.getPatientsKpis, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.gabinet.total"), value: kpis.total },
          { label: t("sidebar.gabinet.newThisMonth"), value: kpis.newThisMonth },
        ]}
      />
      <RecentItems organizationId={organizationId} entityType="gabinetPatients" linkPrefix="/dashboard/gabinet/patients/" />
    </>
  );
}
