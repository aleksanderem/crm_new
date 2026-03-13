import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { StaffLoad } from "../staff-load";
import { useTranslation } from "react-i18next";

export function GabinetCalendarWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.gabinet.sidebarWidgets.getCalendarKpis, { organizationId: organizationId as any });
  const nudges = useQuery(api.gabinet.nudges.getAppointmentNudges, { organizationId: organizationId as any });
  const staffLoad = useQuery(api.gabinet.sidebarWidgets.getStaffLoad, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.gabinet.todayCount"), value: kpis.todayCount },
          { label: t("sidebar.gabinet.confirmed"), value: kpis.confirmed },
          {
            label: t("sidebar.gabinet.unconfirmed"),
            value: kpis.unconfirmed,
            color: kpis.unconfirmed > 0 ? "text-amber-500" : undefined,
          },
        ]}
      />
      {nudges?.map((n) => (
        <NudgeCard key={n.message} message={n.message} severity={n.severity} icon={n.icon} />
      ))}
      {staffLoad && staffLoad.length > 0 && <StaffLoad staff={staffLoad} />}
    </>
  );
}
