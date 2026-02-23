import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, Users, Clock, FileText } from "@/lib/ez-icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/"
)({
  component: GabinetDashboard,
});

function GabinetDashboard() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const today = new Date().toISOString().split("T")[0];

  const { data: todayAppointments } = useQuery(
    convexQuery(api["gabinet/appointments"].listByDate, {
      organizationId,
      date: today,
    })
  );

  const { data: patients } = useQuery(
    convexQuery(api["gabinet/patients"].list, {
      organizationId,
      paginationOpts: { numItems: 200, cursor: null },
    })
  );

  const { data: treatments } = useQuery(
    convexQuery(api["gabinet/treatments"].listActive, { organizationId })
  );

  const { data: leaves } = useQuery(
    convexQuery(api["gabinet/scheduling"].listLeaves, { organizationId })
  );

  const patientMap = useMemo(
    () => new Map((patients?.page ?? []).map((p) => [p._id, `${p.firstName} ${p.lastName}`])),
    [patients]
  );

  const treatmentMap = useMemo(
    () => new Map((treatments ?? []).map((tr) => [tr._id, tr.name])),
    [treatments]
  );

  const enrichedAppointments = useMemo(() => {
    return (todayAppointments ?? []).map((a) => ({
      ...a,
      patientName: patientMap.get(a.patientId) ?? t("common.unknown"),
      treatmentName: treatmentMap.get(a.treatmentId) ?? t("common.unknown"),
    }));
  }, [todayAppointments, patientMap, treatmentMap, t]);

  const pendingLeaves = (leaves ?? []).filter((l) => l.status === "pending");
  const totalPatients = patients?.page?.length ?? 0;
  const totalTreatments = treatments?.length ?? 0;
  const todayCount = enrichedAppointments.length;

  const statusColor = (s: string) => {
    switch (s) {
      case "scheduled": return "outline" as const;
      case "confirmed": return "default" as const;
      case "in_progress": return "default" as const;
      case "completed": return "secondary" as const;
      case "cancelled": return "destructive" as const;
      default: return "secondary" as const;
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t("gabinet.dashboard.title")}
        description={t("gabinet.dashboard.description")}
      />

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/dashboard/gabinet/calendar" className="block">
          <div className="rounded-lg border p-4 transition-colors hover:bg-muted/50 cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                <CalendarCheck className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("gabinet.dashboard.todayAppointments")}</p>
                <p className="text-2xl font-bold">{todayCount}</p>
              </div>
            </div>
          </div>
        </Link>
        <Link to="/dashboard/gabinet/patients" className="block">
          <div className="rounded-lg border p-4 transition-colors hover:bg-muted/50 cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("gabinet.dashboard.totalPatients")}</p>
                <p className="text-2xl font-bold">{totalPatients}</p>
              </div>
            </div>
          </div>
        </Link>
        <Link to="/dashboard/gabinet/treatments" className="block">
          <div className="rounded-lg border p-4 transition-colors hover:bg-muted/50 cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("gabinet.dashboard.totalTreatments")}</p>
                <p className="text-2xl font-bold">{totalTreatments}</p>
              </div>
            </div>
          </div>
        </Link>
        <Link to="/dashboard/gabinet/settings/leaves" className="block">
          <div className="rounded-lg border p-4 transition-colors hover:bg-muted/50 cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("gabinet.dashboard.pendingLeaves")}</p>
                <p className="text-2xl font-bold">{pendingLeaves.length}</p>
              </div>
            </div>
          </div>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's schedule */}
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">{t("gabinet.dashboard.todaySchedule")}</h3>
          </div>
          {enrichedAppointments.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("gabinet.dashboard.noAppointmentsToday")}
            </div>
          ) : (
            <div className="divide-y">
              {enrichedAppointments.map((a) => (
                <div key={a._id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{a.patientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.startTime}–{a.endTime} · {a.treatmentName}
                    </p>
                  </div>
                  <Badge variant={statusColor(a.status)}>{t(`gabinet.appointments.statuses.${a.status}`)}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending leaves */}
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">{t("gabinet.dashboard.pendingLeaveRequests")}</h3>
          </div>
          {pendingLeaves.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("gabinet.dashboard.noPendingLeaves")}
            </div>
          ) : (
            <div className="divide-y">
              {pendingLeaves.map((leave) => (
                <div key={leave._id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium capitalize">{leave.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {leave.startDate} — {leave.endDate}
                    </p>
                  </div>
                  <Badge variant="outline">{t("gabinet.leaves.pending")}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          to="/dashboard/gabinet/calendar"
          className="rounded-lg border p-4 text-center text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          {t("gabinet.dashboard.goToCalendar")}
        </Link>
        <Link
          to="/dashboard/gabinet/patients"
          className="rounded-lg border p-4 text-center text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          {t("gabinet.dashboard.goToPatients")}
        </Link>
        <Link
          to="/dashboard/gabinet/packages"
          className="rounded-lg border p-4 text-center text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          {t("gabinet.dashboard.goToPackages")}
        </Link>
        <Link
          to="/dashboard/gabinet/documents"
          className="rounded-lg border p-4 text-center text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          {t("gabinet.dashboard.goToDocuments")}
        </Link>
      </div>
    </div>
  );
}
