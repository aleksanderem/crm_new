import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { RecentItems } from "../recent-items";
import { SmartAgenda } from "../smart-agenda";
import { BarRanking } from "../bar-ranking";
import { useTranslation } from "react-i18next";

export function GabinetPatientsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const user = useQuery(api.app.getCurrentUser);
  const kpis = useQuery(api.gabinet.sidebarWidgets.getPatientsKpis, { organizationId });
  const topTreatments = useQuery(api.gabinet.sidebarWidgets.getTopTreatments, { organizationId });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.gabinet.total"), value: kpis.total, color: "text-primary" },
          { label: t("sidebar.gabinet.newThisMonth"), value: kpis.newThisMonth, color: "text-emerald-500" },
        ]}
      />

      {/* Smart Agenda */}
      {user?._id && <SmartAgenda organizationId={organizationId} userId={user._id} />}

      {/* Top treatments */}
      {topTreatments && topTreatments.length > 0 && <BarRanking items={topTreatments} />}

      {/* Recent patients */}
      <RecentItems organizationId={organizationId} entityType="gabinetPatients" linkPrefix="/dashboard/gabinet/patients/" />
    </>
  );
}
