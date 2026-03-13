import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { useTranslation } from "react-i18next";

export function GabinetDocumentsWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.gabinet.sidebarWidgets.getDocumentsKpis, { organizationId: organizationId as any });
  const nudges = useQuery(api.gabinet.nudges.getDocumentNudges, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.gabinet.totalTemplates"), value: kpis.totalTemplates },
          { label: t("sidebar.gabinet.newDocumentsThisMonth"), value: kpis.newDocumentsThisMonth },
          { label: t("sidebar.gabinet.pendingSignature"), value: kpis.pendingSignature },
        ]}
      />
      {nudges?.map((n) => (
        <NudgeCard key={n.message} message={n.message} severity={n.severity} icon={n.icon} />
      ))}
    </>
  );
}
