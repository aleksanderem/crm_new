import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { StaffLoad } from "../staff-load";
import { StaffSchedule } from "../staff-schedule";
import { SmartAgenda } from "../smart-agenda";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function GabinetCalendarWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const user = useQuery(api.app.getCurrentUser);
  const kpis = useQuery(api.gabinet.sidebarWidgets.getCalendarKpis, { organizationId });
  const staffLoad = useQuery(api.gabinet.sidebarWidgets.getStaffLoad, { organizationId });
  const todaySchedule = useQuery(api.gabinet.sidebarWidgets.getTodaySchedule, { organizationId });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.gabinet.todayCount"), value: kpis.todayCount, color: "text-primary" },
          { label: t("sidebar.gabinet.confirmed"), value: kpis.confirmed, color: "text-emerald-500" },
        ]}
      />
      <KpiRow
        items={[
          {
            label: t("sidebar.gabinet.unconfirmed"),
            value: kpis.unconfirmed,
            color: kpis.unconfirmed > 0 ? "text-amber-500" : undefined,
          },
        ]}
      />

      {/* Smart Agenda */}
      {user?._id && <SmartAgenda organizationId={organizationId} userId={user._id} />}

      {/* Today's staff schedule */}
      {todaySchedule && todaySchedule.length > 0 && (
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="flex flex-col gap-0.5 px-3 py-2.5">
            <span className="text-sm font-semibold">
              {t("sidebar.gabinet.todayStaffSchedule", "Grafik na dziś")}
            </span>
            <span className="text-muted-foreground text-[10px]">
              {todaySchedule.filter((s) => s.status === "working").length}{" "}
              {t("sidebar.gabinet.staffWorking", "pracuje")}
            </span>
          </CardHeader>
          <Separator />
          <CardContent className="px-3 py-2.5">
            <StaffSchedule items={todaySchedule} />
          </CardContent>
        </Card>
      )}

      {/* Staff load bars */}
      {staffLoad && staffLoad.length > 0 && <StaffLoad staff={staffLoad} />}
    </>
  );
}
