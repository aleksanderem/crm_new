import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { RecentItems } from "../recent-items";
import { useTranslation } from "react-i18next";

export function DocumentsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getDocumentsKpis, { organizationId });
  const nudges = useQuery(api.nudges.getDocumentsNudges, { organizationId });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.total"), value: kpis.total },
          { label: t("sidebar.newThisMonth"), value: kpis.newThisMonth },
          { label: t("sidebar.pendingSent"), value: kpis.pendingSent },
        ]}
      />
      {nudges?.map((n, index) => (
        <NudgeCard
          key={`${n.message}-${index}`}
          message={n.message}
          messageValues={n.messageValues}
          severity={n.severity}
          icon={n.icon}
        />
      ))}
      <RecentItems organizationId={organizationId} entityType="documents" linkPrefix="/dashboard/documents/" />
    </>
  );
}
