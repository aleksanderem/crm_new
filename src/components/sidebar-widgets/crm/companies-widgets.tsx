import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { BarRanking } from "../bar-ranking";
import { RecentItems } from "../recent-items";
import { useTranslation } from "react-i18next";

export function CompaniesWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getCompaniesKpis, { organizationId });
  const nudges = useQuery(api.nudges.getCompaniesNudges, { organizationId });
  const topCompanies = useQuery(api.sidebarWidgets.getTopCompanies, { organizationId });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.total"), value: kpis.total },
          { label: t("sidebar.newThisMonth"), value: kpis.newThisMonth },
          { label: t("sidebar.revenue"), value: kpis.totalRevenue >= 1000 ? `${Math.round(kpis.totalRevenue / 1000)}K` : kpis.totalRevenue },
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
      {topCompanies && topCompanies.length > 0 && <BarRanking items={topCompanies} />}
      <RecentItems organizationId={organizationId} entityType="companies" linkPrefix="/dashboard/companies/" />
    </>
  );
}
