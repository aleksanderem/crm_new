import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Plus } from "@/lib/ez-icons";
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDayView } from "@/components/gabinet/calendar/calendar-day-view";
import { CalendarWeekView } from "@/components/gabinet/calendar/calendar-week-view";
import { CalendarMonthView } from "@/components/gabinet/calendar/calendar-month-view";
import { AppointmentDialog } from "@/components/gabinet/calendar/appointment-dialog";
import { AppointmentDetailDialog } from "@/components/gabinet/calendar/appointment-detail-dialog";
import type { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/calendar/"
)({
  component: GabinetCalendarPage,
});

type ViewMode = "day" | "week" | "month";

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function GabinetCalendarPage() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDefaultDate, setCreateDefaultDate] = useState<string | undefined>();
  const [createDefaultTime, setCreateDefaultTime] = useState<string | undefined>();
  const [detailAppointmentId, setDetailAppointmentId] = useState<string | null>(null);

  // Compute date range based on view mode
  const { startDate, endDate } = useMemo(() => {
    if (viewMode === "day") {
      const ds = formatDateStr(currentDate);
      return { startDate: ds, endDate: ds };
    }
    if (viewMode === "week") {
      const monday = getMonday(currentDate);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return { startDate: formatDateStr(monday), endDate: formatDateStr(sunday) };
    }
    // month
    const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const last = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    return { startDate: formatDateStr(first), endDate: formatDateStr(last) };
  }, [viewMode, currentDate]);

  // Fetch appointments
  const { data: rawAppointments } = useQuery(
    convexQuery(api.gabinet.appointments.listByDateRange, {
      organizationId,
      startDate,
      endDate,
      employeeId: employeeFilter !== "all" ? (employeeFilter as Id<"users">) : undefined,
    })
  );

  // Fetch employees for filter
  const { data: employees } = useQuery(
    convexQuery(api.gabinet.employees.listAll, {
      organizationId,
      activeOnly: true,
    })
  );

  // Fetch members for name resolution
  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );

  // Fetch patients + treatments for display names
  const { data: patientsPage } = useQuery(
    convexQuery(api.gabinet.patients.list, {
      organizationId,
      paginationOpts: { numItems: 200, cursor: null },
    })
  );
  const { data: treatmentsPage } = useQuery(
    convexQuery(api.gabinet.treatments.list, {
      organizationId,
      paginationOpts: { numItems: 200, cursor: null },
    })
  );

  const patientMap = useMemo(() => {
    const map = new Map<string, string>();
    if (patientsPage?.page) {
      for (const p of patientsPage.page) {
        map.set(p._id, `${p.firstName} ${p.lastName}`);
      }
    }
    return map;
  }, [patientsPage]);

  const treatmentMap = useMemo(() => {
    const map = new Map<string, { name: string; color?: string }>();
    if (treatmentsPage?.page) {
      for (const tr of treatmentsPage.page) {
        map.set(tr._id, { name: tr.name, color: tr.color });
      }
    }
    return map;
  }, [treatmentsPage]);

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    members?.forEach((m) => {
      if (m.user) {
        map.set(m.userId, m.user.name || m.user.email || "");
      }
    });
    return map;
  }, [members]);

  // Transform appointments for view components
  const viewAppointments = useMemo(() => {
    if (!rawAppointments) return [];
    return rawAppointments.map((a) => {
      const treatment = treatmentMap.get(a.treatmentId);
      return {
        _id: a._id,
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        patientName: patientMap.get(a.patientId) ?? "",
        treatmentName: treatment?.name ?? "",
        status: a.status,
        color: a.color ?? treatment?.color,
      };
    });
  }, [rawAppointments, patientMap, treatmentMap]);

  // Navigation
  const navigate = useCallback(
    (dir: number) => {
      setCurrentDate((prev) => {
        const d = new Date(prev);
        if (viewMode === "day") d.setDate(d.getDate() + dir);
        else if (viewMode === "week") d.setDate(d.getDate() + dir * 7);
        else d.setMonth(d.getMonth() + dir);
        return d;
      });
    },
    [viewMode]
  );

  const goToday = () => setCurrentDate(new Date());

  // Click-to-create handler
  const handleSlotClick = useCallback(
    (dateOrTime: string, time?: string) => {
      // Day view passes just time, week view passes date + time
      if (time) {
        setCreateDefaultDate(dateOrTime);
        setCreateDefaultTime(time);
      } else {
        setCreateDefaultDate(formatDateStr(currentDate));
        setCreateDefaultTime(dateOrTime);
      }
      setCreateDialogOpen(true);
    },
    [currentDate]
  );

  const handleDayClick = useCallback((date: string) => {
    setCurrentDate(new Date(date + "T00:00:00"));
    setViewMode("day");
  }, []);

  const handleAppointmentClick = useCallback((id: string) => {
    setDetailAppointmentId(id);
  }, []);

  // Title
  const title = useMemo(() => {
    const locale = i18n.language;
    if (viewMode === "day") {
      return currentDate.toLocaleDateString(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    if (viewMode === "week") {
      const monday = getMonday(currentDate);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return `${monday.toLocaleDateString(locale, { month: "short", day: "numeric" })} – ${sunday.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return currentDate.toLocaleDateString(locale, { month: "long", year: "numeric" });
  }, [currentDate, viewMode, i18n.language]);

  function getEmployeeName(emp: {
    firstName?: string;
    lastName?: string;
    userId: string;
    specialization?: string;
    role: string;
  }) {
    if (emp.firstName || emp.lastName) {
      return `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim();
    }
    return userMap.get(emp.userId) || emp.specialization || emp.role;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            {t("gabinet.calendar.today", "Dzis")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="ml-2 text-sm font-semibold">{title}</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Employee filter */}
          <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder={t("gabinet.calendar.allEmployees", "Wszyscy")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("gabinet.calendar.allEmployees", "Wszyscy")}
              </SelectItem>
              {(employees ?? []).map((emp) => (
                <SelectItem key={emp._id} value={emp.userId}>
                  {getEmployeeName(emp)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* View switcher */}
          <div className="flex rounded-md border">
            {(["day", "week", "month"] as const).map((mode) => (
              <Button
                key={mode}
                variant={viewMode === mode ? "default" : "ghost"}
                size="sm"
                className="h-8 rounded-none first:rounded-l-md last:rounded-r-md text-xs px-3"
                onClick={() => setViewMode(mode)}
              >
                {t(`gabinet.calendar.view.${mode}`, mode.charAt(0).toUpperCase() + mode.slice(1))}
              </Button>
            ))}
          </div>

          {/* Create button */}
          <Button
            size="sm"
            onClick={() => {
              setCreateDefaultDate(formatDateStr(currentDate));
              setCreateDefaultTime(undefined);
              setCreateDialogOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("gabinet.appointments.createAppointment", "Nowa wizyta")}
          </Button>
        </div>
      </div>

      {/* Calendar content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "day" && (
          <CalendarDayView
            date={formatDateStr(currentDate)}
            appointments={viewAppointments}
            onSlotClick={(time) => handleSlotClick(formatDateStr(currentDate), time)}
            onAppointmentClick={handleAppointmentClick}
          />
        )}
        {viewMode === "week" && (
          <CalendarWeekView
            weekStart={formatDateStr(getMonday(currentDate))}
            appointments={viewAppointments}
            onSlotClick={handleSlotClick}
            onAppointmentClick={handleAppointmentClick}
            onDayHeaderClick={handleDayClick}
            selectedDate={formatDateStr(currentDate)}
          />
        )}
        {viewMode === "month" && (
          <CalendarMonthView
            year={currentDate.getFullYear()}
            month={currentDate.getMonth()}
            appointments={viewAppointments}
            onDayClick={handleDayClick}
            selectedDate={formatDateStr(currentDate)}
          />
        )}
      </div>

      {/* Create appointment dialog */}
      <AppointmentDialog
        organizationId={organizationId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultDate={createDefaultDate}
        defaultTime={createDefaultTime}
      />

      {/* Appointment detail dialog */}
      {detailAppointmentId && (
        <AppointmentDetailDialog
          organizationId={organizationId}
          appointmentId={detailAppointmentId as Id<"gabinetAppointments">}
          open={!!detailAppointmentId}
          onOpenChange={(open) => {
            if (!open) setDetailAppointmentId(null);
          }}
        />
      )}
    </div>
  );
}
