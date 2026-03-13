import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { useTranslation } from "react-i18next";

export function GabinetPackagesWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.gabinet.sidebarWidgets.getPackagesKpis, { organizationId: organizationId as any });
  const nudges = useQuery(api.gabinet.nudges.getPackageNudges, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.gabinet.totalPackages"), value: kpis.totalPackages },
          { label: t("sidebar.gabinet.activePackages"), value: kpis.activePackages },
          { label: t("sidebar.gabinet.expiringPackages"), value: kpis.expiringPackages },
        ]}
      />
      {nudges?.map((n) => (
        <NudgeCard key={n.message} message={n.message} severity={n.severity} icon={n.icon} />
      ))}
    </>
  );
}
