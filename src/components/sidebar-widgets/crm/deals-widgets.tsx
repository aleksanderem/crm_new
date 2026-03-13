import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { MiniFunnel } from "../mini-funnel";
import { SmartAgenda } from "../smart-agenda";
import { RecentItems } from "../recent-items";
import { useTranslation } from "react-i18next";

export function DealsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const user = useQuery(api.app.getCurrentUser);
  const kpis = useQuery(api.sidebarWidgets.getDealsKpis, { organizationId });
  const nudges = useQuery(api.nudges.getDealsNudges, { organizationId });
  const stages = useQuery(api.sidebarWidgets.getLeadsByStage, { organizationId });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.open"), value: kpis.openCount, color: "text-primary" },
          { label: t("sidebar.pipeline"), value: kpis.pipelineValue >= 1000 ? `${Math.round(kpis.pipelineValue / 1000)}K` : kpis.pipelineValue },
          { label: t("sidebar.winRate"), value: `${kpis.winRate}%`, color: "text-emerald-500" },
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
      {stages && stages.length > 0 && <MiniFunnel stages={stages} />}
      {user?._id && <SmartAgenda organizationId={organizationId} userId={user._id} />}
      <RecentItems organizationId={organizationId} entityType="leads" linkPrefix="/dashboard/leads/" />
    </>
  );
}
