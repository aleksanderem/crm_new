import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { StaffSchedule } from "../staff-schedule";
import { useTranslation } from "react-i18next";

export function GabinetEmployeesWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.gabinet.sidebarWidgets.getEmployeesKpis, { organizationId: organizationId as any });
  const nudges = useQuery(api.gabinet.nudges.getLeaveNudges, { organizationId: organizationId as any });
  const schedule = useQuery(api.gabinet.sidebarWidgets.getTodaySchedule, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.gabinet.activeCount"), value: kpis.activeCount },
          { label: t("sidebar.gabinet.onLeave"), value: kpis.onLeave },
          {
            label: t("sidebar.gabinet.pendingLeaveRequests"),
            value: kpis.pendingLeaveRequests,
            color: kpis.pendingLeaveRequests > 0 ? "text-red-500" : undefined,
          },
        ]}
      />
      {nudges?.map((n) => (
        <NudgeCard key={n.message} message={n.message} severity={n.severity} icon={n.icon} />
      ))}
      {schedule && schedule.length > 0 && <StaffSchedule items={schedule} />}
    </>
  );
}
