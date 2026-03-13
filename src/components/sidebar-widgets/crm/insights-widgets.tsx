import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { MiniFunnel } from "../mini-funnel";
import { SmartAgenda } from "../smart-agenda";
import { useTranslation } from "react-i18next";

export function InsightsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const user = useQuery(api.app.getCurrentUser);
  const kpis = useQuery(api.sidebarWidgets.getInsightsKpis, { organizationId });
  const nudges = useQuery(api.nudges.getInsightsNudges, { organizationId });
  const stages = useQuery(api.sidebarWidgets.getLeadsByStage, { organizationId });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          {
            label: t("sidebar.revenue"),
            value: kpis.revenue >= 1000 ? `${Math.round(kpis.revenue / 1000)}K` : kpis.revenue,
            color: "text-emerald-500",
            trend: kpis.revenueTrend !== 0
              ? { value: Math.abs(kpis.revenueTrend), positive: kpis.revenueTrend > 0 }
              : undefined,
          },
          {
            label: t("sidebar.pipeline"),
            value: kpis.pipelineValue >= 1000 ? `${Math.round(kpis.pipelineValue / 1000)}K` : kpis.pipelineValue,
            color: "text-primary",
          },
        ]}
      />
      <KpiRow
        items={[
          { label: t("sidebar.contacts"), value: kpis.totalContacts },
          { label: t("sidebar.companies"), value: kpis.totalCompanies },
          { label: t("sidebar.winRate"), value: `${kpis.winRate}%` },
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
    </>
  );
}
