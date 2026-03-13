import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { useTranslation } from "react-i18next";

export function InsightsWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getInsightsKpis, { organizationId: organizationId as any });
  const nudges = useQuery(api.nudges.getInsightsNudges, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          {
            label: t("sidebar.revenue"),
            value: `${Math.round(kpis.revenue / 1000)}K`,
            color: "text-emerald-500",
            trend: { value: Math.abs(kpis.revenueTrend), positive: kpis.revenueTrend >= 0 },
          },
          {
            label: t("sidebar.pipeline"),
            value: `${Math.round(kpis.pipelineValue / 1000)}K`,
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
      {nudges?.map((n, i) => (
        <NudgeCard key={i} message={n.message} severity={n.severity} icon={n.icon} />
      ))}
    </>
  );
}
