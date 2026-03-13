import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { useTranslation } from "react-i18next";

export function GabinetReportsWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.gabinet.sidebarWidgets.getReportsKpis, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <KpiRow
      items={[
        { label: t("sidebar.gabinet.thisMonthAppointments"), value: kpis.thisMonthAppointments },
        {
          label: t("sidebar.gabinet.visitTrend"),
          value: `${kpis.visitTrend > 0 ? "+" : ""}${kpis.visitTrend}%`,
          color: kpis.visitTrend > 0 ? "text-emerald-500" : kpis.visitTrend < 0 ? "text-red-500" : undefined,
        },
        { label: t("sidebar.gabinet.attendance"), value: `${kpis.attendance}%` },
      ]}
    />
  );
}
