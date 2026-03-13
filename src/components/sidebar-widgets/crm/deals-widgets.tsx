import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { useTranslation } from "react-i18next";

export function DealsWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getDealsKpis, { organizationId: organizationId as any });
  const nudges = useQuery(api.nudges.getDealsNudges, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.open"), value: kpis.openCount, color: "text-primary" },
          { label: t("sidebar.pipeline"), value: `${Math.round(kpis.pipelineValue / 1000)}K` },
          { label: t("sidebar.winRate"), value: `${kpis.winRate}%`, color: "text-emerald-500" },
        ]}
      />
      {nudges?.map((n, i) => (
        <NudgeCard key={i} message={n.message} severity={n.severity} icon={n.icon} />
      ))}
    </>
  );
}
