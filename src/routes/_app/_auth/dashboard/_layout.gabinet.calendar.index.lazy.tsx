import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useWideContent } from "@/hooks/use-wide-content";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Plus, Search, X } from "@/lib/ez-icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PrintSchedule } from "@/components/gabinet/calendar/print-schedule";
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CalendarDayView } from "@/components/gabinet/calendar/calendar-day-view";
import { CalendarWeekView } from "@/components/gabinet/calendar/calendar-week-view";
import { CalendarMonthView } from "@/components/gabinet/calendar/calendar-month-view";
import { AppointmentDialog } from "@/components/gabinet/calendar/appointment-dialog";
import { AppointmentCard } from "@/components/gabinet/calendar/appointment-card";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { toast } from "sonner";
import type { Id } from "@cvx/_generated/dataModel";

export const Route = createLazyFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/calendar/",
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
  const navigate = useNavigate();

  // Indicate this page has wide content (hides Column 2 on 1024-1400px screens)
  useWideContent(true);

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [treatmentFilter, setTreatmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientSearch, setClientSearch] = useState("");

  // Filter dialog
  const [filterOpen, setFilterOpen] = useState(false);

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDefaultDate, setCreateDefaultDate] = useState<
    string | undefined
  >();
  const [createDefaultTime, setCreateDefaultTime] = useState<
    string | undefined
  >();

  // Drag state
  const [activeAppointment, setActiveAppointment] = useState<{
    _id: string;
    startTime: string;
    endTime: string;
    patientName: string;
    treatmentName: string;
    status: string;
    color?: string;
  } | null>(null);

  // Mutations
  const updateAppointment = useMutation(api.gabinet.appointments.update);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

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
      return {
        startDate: formatDateStr(monday),
        endDate: formatDateStr(sunday),
      };
    }
    // month
    const first = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );
    const last = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0,
    );
    return { startDate: formatDateStr(first), endDate: formatDateStr(last) };
  }, [viewMode, currentDate]);

  // Fetch appointments
  const { data: rawAppointments } = useQuery(
    convexQuery(api.gabinet.appointments.listByDateRange, {
      organizationId,
      startDate,
      endDate,
      employeeId:
        employeeFilter !== "all" ? (employeeFilter as Id<"users">) : undefined,
    }),
  );

  // Fetch employees for filter
  const { data: employees } = useQuery(
    convexQuery(api.gabinet.employees.listAll, {
      organizationId,
      activeOnly: true,
    }),
  );

  // Fetch members for name resolution
  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId }),
  );

  // Fetch patients + treatments for display names
  const { data: patientsPage } = useQuery(
    convexQuery(api.gabinet.patients.list, {
      organizationId,
      paginationOpts: { numItems: 200, cursor: null },
    }),
  );
  const { data: treatmentsPage } = useQuery(
    convexQuery(api.gabinet.treatments.list, {
      organizationId,
      paginationOpts: { numItems: 200, cursor: null },
    }),
  );

  // Fetch employee schedules for working hours display
  const { data: employeeSchedulesRaw } = useQuery(
    convexQuery(api.gabinet.scheduling.listEmployeeSchedules, {
      organizationId,
    }),
  );

  // Fetch clinic working hours as fallback
  const { data: clinicWorkingHours } = useQuery(
    convexQuery(api.gabinet.scheduling.getWorkingHours, { organizationId }),
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

  // Build schedule map for the filtered employee (or all employees)
  const employeeSchedules = useMemo(() => {
    const map = new Map<
      string,
      {
        startTime: string;
        endTime: string;
        breakStart?: string;
        breakEnd?: string;
      }
    >();

    // If filtering by specific employee, use their schedule
    if (employeeFilter !== "all" && employeeSchedulesRaw) {
      const empSchedules = employeeSchedulesRaw.filter(
        (s) => s.userId === employeeFilter,
      );
      for (const s of empSchedules) {
        if (s.isWorking) {
          map.set(`${s.dayOfWeek}`, {
            startTime: s.startTime,
            endTime: s.endTime,
            breakStart: s.breakStart,
            breakEnd: s.breakEnd,
          });
        }
      }
    } else if (clinicWorkingHours) {
      // Otherwise use clinic default working hours
      for (const wh of clinicWorkingHours) {
        if (wh.isOpen) {
          map.set(`${wh.dayOfWeek}`, {
            startTime: wh.startTime,
            endTime: wh.endTime,
            breakStart: wh.breakStart,
            breakEnd: wh.breakEnd,
          });
        }
      }
    }

    return map;
  }, [employeeFilter, employeeSchedulesRaw, clinicWorkingHours]);

  // Get working hours for day view (today's schedule)
  const dayWorkingHours = useMemo(() => {
    if (viewMode !== "day") return null;
    const dayOfWeek = new Date(currentDate).getDay();
    const dow = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
    return employeeSchedules.get(`${dow}`) ?? null;
  }, [viewMode, currentDate, employeeSchedules]);

  // Transform and filter appointments for view components
  const viewAppointments = useMemo(() => {
    if (!rawAppointments) return [];
    const searchLower = clientSearch.toLowerCase().trim();
    return rawAppointments
      .filter((a) => {
        if (treatmentFilter !== "all" && a.treatmentId !== treatmentFilter) return false;
        if (statusFilter !== "all" && a.status !== statusFilter) return false;
        if (searchLower) {
          const name = patientMap.get(a.patientId) ?? "";
          if (!name.toLowerCase().includes(searchLower)) return false;
        }
        return true;
      })
      .map((a) => {
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
  }, [rawAppointments, patientMap, treatmentMap, treatmentFilter, statusFilter, clientSearch]);

  // Build print-friendly appointment data for the current day
  const printDate = formatDateStr(currentDate);
  const printAppointments = useMemo(() => {
    if (!rawAppointments) return [];
    const dayAppts = rawAppointments.filter((a) => a.date === printDate);
    return dayAppts.map((a) => {
      const treatment = treatmentMap.get(a.treatmentId);
      return {
        startTime: a.startTime,
        endTime: a.endTime,
        patientName: patientMap.get(a.patientId) ?? "",
        treatmentName: treatment?.name ?? "",
        employeeName: userMap.get(a.employeeId) ?? "",
        status: a.status,
      };
    });
  }, [rawAppointments, printDate, patientMap, treatmentMap, userMap]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // Listen for print dispatch from footer
  useSidebarDispatch("printSchedule", handlePrint);

  // Navigation
  const navigateDate = useCallback(
    (dir: number) => {
      setCurrentDate((prev) => {
        const d = new Date(prev);
        if (viewMode === "day") d.setDate(d.getDate() + dir);
        else if (viewMode === "week") d.setDate(d.getDate() + dir * 7);
        else d.setMonth(d.getMonth() + dir);
        return d;
      });
    },
    [viewMode],
  );

  const goToday = () => setCurrentDate(new Date());

  // Sidebar dispatch handlers
  useSidebarDispatch("goToToday", goToday);
  useSidebarDispatch("openFilter", () => setFilterOpen(true));

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
    [currentDate],
  );

  const handleDayClick = useCallback((date: string) => {
    setCurrentDate(new Date(date + "T00:00:00"));
    setViewMode("day");
  }, []);

  const handleAppointmentClick = useCallback(
    (id: string) => {
      // Navigate to full-page appointment detail
      navigate({
        to: "/dashboard/gabinet/appointments/$appointmentId",
        params: { appointmentId: id },
      });
    },
    [navigate],
  );

  // DnD handlers
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const appt = viewAppointments.find((a) => a._id === active.id);
      if (appt) {
        setActiveAppointment(appt);
      }
    },
    [viewAppointments],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveAppointment(null);

      if (!over) return;

      const appointmentId = active.id as string;
      const dropData = over.data.current;

      if (dropData?.type === "time-slot") {
        const newDate = dropData.date as string;
        const newStartTime = dropData.time as string;

        // Find the original appointment to calculate duration
        const originalAppt = viewAppointments.find(
          (a) => a._id === appointmentId,
        );
        if (!originalAppt) return;

        // Calculate new end time based on original duration
        const [startH, startM] = originalAppt.startTime.split(":").map(Number);
        const [endH, endM] = originalAppt.endTime.split(":").map(Number);
        const durationMinutes = endH * 60 + endM - (startH * 60 + startM);

        const [newStartH, newStartM] = newStartTime.split(":").map(Number);
        const newEndMinutes = newStartH * 60 + newStartM + durationMinutes;
        const newEndH = Math.floor(newEndMinutes / 60);
        const newEndM = newEndMinutes % 60;
        const newEndTime = `${String(newEndH).padStart(2, "0")}:${String(newEndM).padStart(2, "0")}`;

        try {
          await updateAppointment({
            organizationId,
            appointmentId: appointmentId as Id<"gabinetAppointments">,
            date: newDate,
            startTime: newStartTime,
            endTime: newEndTime,
          });
          toast.success(
            t("gabinet.appointments.rescheduled", "Appointment rescheduled"),
          );
        } catch (e: any) {
          toast.error(
            e.message ??
              t(
                "gabinet.appointments.rescheduleFailed",
                "Failed to reschedule",
              ),
          );
        }
      }
    },
    [organizationId, updateAppointment, viewAppointments, t],
  );

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
    return currentDate.toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });
  }, [currentDate, viewMode, i18n.language]);

  // Active filter count (excluding employee which is the primary filter)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (treatmentFilter !== "all") count++;
    if (statusFilter !== "all") count++;
    if (clientSearch.trim()) count++;
    return count;
  }, [treatmentFilter, statusFilter, clientSearch]);

  const clearAllFilters = useCallback(() => {
    setEmployeeFilter("all");
    setTreatmentFilter("all");
    setStatusFilter("all");
    setClientSearch("");
  }, []);

  const statusOptions = [
    "scheduled",
    "confirmed",
    "in_progress",
    "completed",
    "cancelled",
    "no_show",
  ] as const;

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
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-[calc(100vh-4rem)] flex-col">
        {/* Toolbar */}
        <div className="flex shrink-0 flex-col gap-2 border-b bg-background px-4 py-3">
          {/* Row 1: nav arrows + date title + view switcher + actions */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => navigateDate(-1)}
                aria-label={t("gabinet.calendar.previousPeriod")}
              >
                <ChevronLeft className="h-3.5 w-3.5" variant="stroke" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={goToday}>
                {t("gabinet.calendar.today", "Dzis")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => navigateDate(1)}
                aria-label={t("gabinet.calendar.nextPeriod")}
              >
                <ChevronRight className="h-3.5 w-3.5" variant="stroke" />
              </Button>
              <h2 className="ml-2 text-xs font-semibold">{title}</h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* View switcher */}
              <div className="flex rounded-md border">
                {(["day", "week", "month"] as const).map((mode) => (
                  <Button
                    key={mode}
                    variant={viewMode === mode ? "default" : "ghost"}
                    size="sm"
                    className="h-7 rounded-none first:rounded-l-md last:rounded-r-md text-xs px-3"
                    onClick={() => setViewMode(mode)}
                  >
                    {t(
                      `gabinet.calendar.view.${mode}`,
                      mode.charAt(0).toUpperCase() + mode.slice(1),
                    )}
                  </Button>
                ))}
              </div>

              {/* Create button */}
              <Button
                size="sm"
                className="h-7 text-xs"
                data-testid="calendar-create-appointment-button"
                onClick={() => {
                  setCreateDefaultDate(formatDateStr(currentDate));
                  setCreateDefaultTime(undefined);
                  setCreateDialogOpen(true);
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" variant="stroke" />
                {t("gabinet.appointments.createAppointment", "Nowa wizyta")}
              </Button>
            </div>
          </div>

          {/* Filter dialog */}
          <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogTitle>{t("gabinet.calendar.filters", "Filtry")}</DialogTitle>
              <DialogDescription className="sr-only">
                {t("gabinet.calendar.filters", "Filtry")}
              </DialogDescription>
              <div className="space-y-4 pt-2">
                {/* Client search */}
                <div className="space-y-1.5">
                  <Label>{t("gabinet.calendar.client", "Klient")}</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" variant="stroke" />
                    <Input
                      placeholder={t("gabinet.calendar.searchClient", "Szukaj klienta...")}
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="pl-9"
                    />
                    {clientSearch && (
                      <button
                        onClick={() => setClientSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" variant="stroke" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Employee filter */}
                <div className="space-y-1.5">
                  <Label>{t("gabinet.calendar.employee", "Pracownik")}</Label>
                  <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("gabinet.calendar.allEmployees", "Wszyscy pracownicy")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {t("gabinet.calendar.allEmployees", "Wszyscy pracownicy")}
                      </SelectItem>
                      {(employees ?? []).map((emp) => (
                        <SelectItem key={emp._id} value={emp.userId}>
                          {getEmployeeName(emp)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Treatment filter */}
                <div className="space-y-1.5">
                  <Label>{t("gabinet.calendar.treatment", "Zabieg")}</Label>
                  <Select value={treatmentFilter} onValueChange={setTreatmentFilter}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("gabinet.calendar.allTreatments", "Wszystkie zabiegi")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {t("gabinet.calendar.allTreatments", "Wszystkie zabiegi")}
                      </SelectItem>
                      {(treatmentsPage?.page ?? []).map((tr) => (
                        <SelectItem key={tr._id} value={tr._id}>
                          {tr.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Status filter */}
                <div className="space-y-1.5">
                  <Label>{t("gabinet.calendar.status", "Status")}</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("gabinet.calendar.allStatuses", "Wszystkie statusy")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {t("gabinet.calendar.allStatuses", "Wszystkie statusy")}
                      </SelectItem>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`gabinet.appointments.statuses.${s}`, s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Clear all */}
                {activeFilterCount > 0 && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={clearAllFilters}
                  >
                    <X className="mr-1.5 size-4" variant="stroke" />
                    {t("gabinet.calendar.clearFilters", "Wyczyść filtry")}
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Calendar content */}
        <div className="flex-1 overflow-hidden">
          {viewMode === "day" && (
            <CalendarDayView
              date={formatDateStr(currentDate)}
              appointments={viewAppointments}
              onSlotClick={(time) =>
                handleSlotClick(formatDateStr(currentDate), time)
              }
              onAppointmentClick={handleAppointmentClick}
              workingHours={dayWorkingHours}
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
              employeeSchedules={employeeSchedules}
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
      </div>

      {/* Print-only schedule table */}
      <PrintSchedule date={printDate} appointments={printAppointments} />

      {/* Drag overlay - shows appointment being dragged */}
      <DragOverlay>
        {activeAppointment ? (
          <div className="w-48 opacity-90 shadow-lg">
            <AppointmentCard
              startTime={activeAppointment.startTime}
              endTime={activeAppointment.endTime}
              patientName={activeAppointment.patientName}
              treatmentName={activeAppointment.treatmentName}
              status={activeAppointment.status}
              color={activeAppointment.color}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
