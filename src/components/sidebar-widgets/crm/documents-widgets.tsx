import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { useTranslation } from "react-i18next";

export function DocumentsWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getDocumentsKpis, { organizationId: organizationId as any });
  const nudges = useQuery(api.nudges.getDocumentsNudges, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.total"), value: kpis.total },
          { label: t("sidebar.newThisMonth"), value: kpis.newThisMonth },
          { label: t("sidebar.pendingSignature"), value: kpis.pendingSignature },
        ]}
      />
      {nudges?.map((n) => (
        <NudgeCard key={n.message} message={n.message} severity={n.severity} icon={n.icon} />
      ))}
    </>
  );
}
