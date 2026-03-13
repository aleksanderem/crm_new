import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { useTranslation } from "react-i18next";

export function GabinetDashboardWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.gabinet.sidebarWidgets.getDashboardKpis, { organizationId: organizationId as any });
  const appointmentNudges = useQuery(api.gabinet.nudges.getAppointmentNudges, { organizationId: organizationId as any });
  const leaveNudges = useQuery(api.gabinet.nudges.getLeaveNudges, { organizationId: organizationId as any });

  if (!kpis) return null;

  const nudges = [...(appointmentNudges ?? []), ...(leaveNudges ?? [])].slice(0, 2);

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.gabinet.todayAppointments"), value: kpis.todayAppointments, color: "text-primary" },
          { label: t("sidebar.gabinet.confirmedToday"), value: kpis.confirmedToday, color: "text-emerald-500" },
        ]}
      />
      <KpiRow
        items={[
          { label: t("sidebar.gabinet.totalPatients"), value: kpis.totalPatients },
          { label: t("sidebar.gabinet.activeEmployees"), value: kpis.activeEmployees },
        ]}
      />
      {nudges.map((n) => (
        <NudgeCard key={n.message} message={n.message} severity={n.severity} icon={n.icon} />
      ))}
    </>
  );
}
