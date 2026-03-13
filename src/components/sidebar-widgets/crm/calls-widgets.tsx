import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { useTranslation } from "react-i18next";

export function CallsWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getCallsKpis, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <KpiRow
      items={[
        { label: t("sidebar.todayCalls"), value: kpis.todayCount },
        { label: t("sidebar.answerRate"), value: `${kpis.answerRate}%` },
        { label: t("sidebar.avgDuration"), value: `${kpis.avgDurationSec}s` },
      ]}
    />
  );
}
