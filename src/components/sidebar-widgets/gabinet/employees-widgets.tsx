import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { StaffSchedule } from "../staff-schedule";
import { StaffLoad } from "../staff-load";
import { SmartAgenda } from "../smart-agenda";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function GabinetEmployeesWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const user = useQuery(api.app.getCurrentUser);
  const kpis = useQuery(api.gabinet.sidebarWidgets.getEmployeesKpis, { organizationId });
  const schedule = useQuery(api.gabinet.sidebarWidgets.getTodaySchedule, { organizationId });
  const staffLoad = useQuery(api.gabinet.sidebarWidgets.getStaffLoad, { organizationId });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.gabinet.activeCount"), value: kpis.activeCount, color: "text-primary" },
          { label: t("sidebar.gabinet.onLeave"), value: kpis.onLeave },
        ]}
      />
      <KpiRow
        items={[
          {
            label: t("sidebar.gabinet.pendingLeaveRequests"),
            value: kpis.pendingLeaveRequests,
            color: kpis.pendingLeaveRequests > 0 ? "text-red-500" : undefined,
          },
        ]}
      />

      {/* Smart Agenda */}
      {user?._id && <SmartAgenda organizationId={organizationId} userId={user._id} />}

      {/* Today's staff schedule */}
      {schedule && schedule.length > 0 && (
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="flex flex-col gap-0.5 px-3 py-2.5">
            <span className="text-sm font-semibold">
              {t("sidebar.gabinet.todayStaffSchedule", "Grafik na dziś")}
            </span>
            <span className="text-muted-foreground text-[10px]">
              {schedule.filter((s) => s.status === "working").length}{" "}
              {t("sidebar.gabinet.staffWorking", "pracuje")}
            </span>
          </CardHeader>
          <Separator />
          <CardContent className="px-3 py-2.5">
            <StaffSchedule items={schedule} />
          </CardContent>
        </Card>
      )}

      {/* Staff load bars */}
      {staffLoad && staffLoad.length > 0 && <StaffLoad staff={staffLoad} />}
    </>
  );
}
