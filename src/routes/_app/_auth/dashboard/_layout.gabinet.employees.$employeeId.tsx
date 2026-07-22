import { useState, useMemo, useEffect, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction, useQuery as useConvexQuery, useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import {
  useSupabaseGabinetEmployee,
  useSupabaseGabinetEmployeesList,
} from "@/hooks/use-supabase-gabinet-employees";
import { useSupabaseGabinetEmployeeSchedulesList } from "@/hooks/use-supabase-gabinet-employee-schedules";
import { useSupabaseGabinetWorkingHoursList } from "@/hooks/use-supabase-gabinet-working-hours";
import { useSupabaseOrganizationMembers } from "@/hooks/use-supabase-organizations";
import { useSupabaseGabinetTreatmentsList } from "@/hooks/use-supabase-gabinet-treatments";
import { useSupabaseActivityTypesList } from "@/hooks/use-supabase-activity-types";
import { useSupabaseActivitiesByEntity } from "@/hooks/use-supabase-activities";
import { useSupabaseScheduledActivitiesByEntity } from "@/hooks/use-supabase-scheduled-activities";
import { useSupabaseNotesByEntity } from "@/hooks/use-supabase-notes";
import { useSupabaseGabinetAppointmentsByEmployee } from "@/hooks/use-supabase-gabinet-appointments";
import {
  FlexibleScheduleEditor,
  groupSchedulesIntoPeriods,
} from "@/components/gabinet/flexible-schedule-editor";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatPhoneNumber } from "@/lib/phone";
import { formatBirthDate, parseBirthDateToIso } from "@/lib/format-date";
import {
  EntityDetailLayout,
  type DetailField,
} from "@/components/crm/entity-detail-layout";
import { EntityDocumentsTab } from "@/components/documents/entity-documents-tab";
import { SidePanel } from "@/components/crm/side-panel";
import { ActivityDetailDrawer } from "@/components/crm/activity-detail-drawer";
import { ActivityFeed } from "@/components/crm/activity-feed";
import { activitiesToFeedEntries } from "@/components/crm/activity-feed-adapter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { PlateText, plateJsonToText } from "@/components/plate-text";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  RotateCcw,
  Search,
  X,
  Calendar,
  ClipboardList,
  User,
  Plus,
  Briefcase,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  Star,
  FileText,
} from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import type { EmployeePatientStats } from "@cvx/gabinet/appointments";
import type { GabinetEmployeeRole } from "@cvx/schema";
import type { MappedGabinetAppointment } from "@/lib/supabase/mappers/gabinet/appointments";
import type { MappedGabinetEmployee } from "@/lib/supabase/mappers/gabinet/employees";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";
import { appointmentStatusBadgeClass } from "@/lib/gabinet-appointment-status";
import { PermissionGate, useRole } from "@/hooks/use-permission";

function EmployeeDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/employees/$employeeId"
)({
  component: () => (
    <PermissionGate feature="gabinet_employees" action="view" loadingFallback={<EmployeeDetailSkeleton />}>
      <EmployeeDetail />
    </PermissionGate>
  ),
});

const ROLES = ["doctor", "cosmetologist", "nurse", "therapist", "receptionist", "manager", "admin", "other"] as const;

function EmployeeDetail() {
  const { employeeId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { role } = useRole();

  // Mutations
  const updateEmployee = useAction(api.gabinet.employees.update);
  const removeEmployee = useAction(api.gabinet.employees.remove);
  const setQualifiedTreatments = useAction(api.gabinet.employees.setQualifiedTreatments);
  const createNote = useAction(api.notes.create);
  const markActivityComplete = useAction(api.scheduledActivities.markComplete);
  const markActivityIncomplete = useAction(api.scheduledActivities.markIncomplete);
  const updateScheduledActivity = useAction(api.scheduledActivities.update);
  const removeScheduledActivity = useAction(api.scheduledActivities.remove);
  const bulkSetEmployeeSchedule = useAction(api.gabinet.scheduling.bulkSetEmployeeSchedule);
  const saveSchedulePeriod = useAction(api.gabinet.scheduling.saveSchedulePeriod);
  const removeSchedulePeriod = useAction(api.gabinet.scheduling.removeSchedulePeriod);
  const trackView = useAction(api.recentlyViewed.track);
  const listDocumentsByEntity = useAction(api.documents.documents.listByEntity);
  const changeEmployeePassword = useAction(api.gabinet.employees.changeEmployeePassword);

  // Supabase cache invalidation helpers
  const invalidateEmployeeCache = () => {
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetEmployees.list(organizationId) });
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetEmployees.detail(organizationId, employeeId) });
  };
  const invalidateScheduleCache = () => {
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetEmployeeSchedules.list(organizationId) });
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetWorkingHours.list(organizationId) });
  };

  // UI state
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [treatmentSearch, setTreatmentSearch] = useState("");
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changePasswordSubmitting, setChangePasswordSubmitting] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Main navigation groups (preparatory layer for future micro-tasks)
  const [activeNavGroup, setActiveNavGroup] = useState<string>("clientsAndVisits");

  // Feature 1: Appointments view mode (calendar vs list)
  const [appointmentsView, setAppointmentsView] = useState<"calendar" | "list">("calendar");
  const [calendarWeekStart, setCalendarWeekStart] = useState<string>(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday.toISOString().split("T")[0];
  });

  // Feature 2: Clients tab search/filter state
  const [clientSearch, setClientSearch] = useState("");
  const [clientStatusFilter, setClientStatusFilter] = useState<string>("all");
  const [clientTreatmentFilter, setClientTreatmentFilter] = useState<string>("all");

  const queryClient = useQueryClient();
  const { setShellSidebarMode } = useSidebarSlot();

  // Queries
  const { data: employee, isLoading } = useSupabaseGabinetEmployee(
    organizationId,
    employeeId,
  );

  const { data: members } = useSupabaseOrganizationMembers(organizationId);

  const { data: allEmployees } = useSupabaseGabinetEmployeesList(organizationId);

  const { data: treatments } = useSupabaseGabinetTreatmentsList(organizationId);

  const { data: activityTypeDefs } = useSupabaseActivityTypesList(organizationId);

  const { data: activities } = useSupabaseActivitiesByEntity(
    organizationId,
    "gabinetEmployee",
    employeeId,
  );

  const { data: scheduledActivitiesData } = useSupabaseScheduledActivitiesByEntity(
    organizationId,
    "gabinetEmployee",
    employeeId,
  );

  const { data: notesData } = useSupabaseNotesByEntity(
    organizationId,
    "gabinetEmployee",
    employeeId,
  );

  // Appointments for this employee (by userId)
  const { data: employeeAppointments } = useSupabaseGabinetAppointmentsByEmployee(
    organizationId,
    employee?.userId ?? undefined,
    { enabled: !!employee },
  );

  // Unique patients this employee has seen (Supabase-primary action)
  const listPatientsWithStatsForEmployee = useAction(api.gabinet.appointments.listPatientsWithStatsForEmployee);
  const { data: employeePatients } = useQuery({
    queryKey: [
      "gabinet.appointments.listPatientsWithStatsForEmployee",
      organizationId,
      employee?.userId,
    ],
    queryFn: () =>
      listPatientsWithStatsForEmployee({
        organizationId,
        employeeId: (employee?.userId ?? "") as string,
      }),
    enabled: !!employee?.userId,
  });

  const { data: employeeDocuments } = useQuery({
    queryKey: [
      "documents.documents.listByEntity",
      organizationId,
      "employee",
      employeeId,
    ],
    queryFn: () =>
      listDocumentsByEntity({
        organizationId,
        entityType: "employee",
        entityId: employeeId,
      }),
    enabled: !!organizationId && !!employeeId,
  });

  // Employee schedule (per-employee working hours)
  const { data: employeeScheduleData } = useSupabaseGabinetEmployeeSchedulesList(
    organizationId,
    {
      userId: employee?.userId ?? "",
      enabled: !!employee,
    },
  );

  // Clinic-wide working hours (fallback)
  const { data: clinicHours } = useSupabaseGabinetWorkingHoursList(organizationId);

  // Selected activity for drawer
  const selectedActivity = scheduledActivitiesData?.find(
    (a) => a._id === selectedActivityId
  ) ?? null;

  useEffect(() => {
    setShellSidebarMode("icon-only");
    return () => setShellSidebarMode("default");
  }, [setShellSidebarMode]);

  // Memos
  const userMap = useMemo(() => {
    const map = new Map<string, { name?: string | null; email?: string | null }>();
    members?.forEach((m) => {
      if (m.user) map.set(m.userId, m.user);
    });
    return map;
  }, [members]);

  const treatmentMap = useMemo(() => {
    const map = new Map<string, string>();
    treatments?.forEach((tr) => map.set(tr._id, tr.name));
    return map;
  }, [treatments]);

  const availableTreatments = useMemo(() => {
    if (!treatments || !employee) return [];
    const assignedSet = new Set(employee.qualifiedTreatmentIds);
    const filtered = treatments.filter((tr) => !assignedSet.has(tr._id));
    if (!treatmentSearch) return filtered;
    const q = treatmentSearch.toLowerCase();
    return filtered.filter((tr) => tr.name.toLowerCase().includes(q));
  }, [treatments, employee, treatmentSearch]);

  // Feature 1: Calendar week dates and filtered appointments
  const calendarWeekDates = useMemo(() => {
    const d = new Date(calendarWeekStart + "T00:00:00");
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(d);
      day.setDate(d.getDate() + i);
      return day.toISOString().split("T")[0];
    });
  }, [calendarWeekStart]);

  const calendarAppointments = useMemo(() => {
    if (!employeeAppointments) return [];
    const weekEnd = calendarWeekDates[6];
    return employeeAppointments.filter(
      (a) => a.date >= calendarWeekStart && a.date <= weekEnd
    );
  }, [employeeAppointments, calendarWeekStart, calendarWeekDates]);

  // Feature 2: Filtered clients
  const filteredClients = useMemo(() => {
    if (!employeePatients) return [];
    let result = [...employeePatients];
    // Search filter
    if (clientSearch) {
      const q = clientSearch.toLowerCase();
      result = result.filter((p) => {
        const name = `${p.firstName} ${p.lastName}`.toLowerCase();
        const email = (p.email ?? "").toLowerCase();
        const phone = (p.phone ?? "").toLowerCase();
        return name.includes(q) || email.includes(q) || phone.includes(q);
      });
    }
    // Status filter
    if (clientStatusFilter !== "all") {
      result = result.filter((p) => p.statuses.includes(clientStatusFilter));
    }
    // Treatment filter
    if (clientTreatmentFilter !== "all") {
      result = result.filter((p) => p.treatmentIds.includes(clientTreatmentFilter));
    }
    return result;
  }, [employeePatients, clientSearch, clientStatusFilter, clientTreatmentFilter]);

  // Feature 3: Group schedule entries into periods by effectiveFrom
  const schedulePeriods = useMemo(
    () => groupSchedulesIntoPeriods(employeeScheduleData),
    [employeeScheduleData],
  );

  // Track recently viewed
  useEffect(() => {
    if (employee && organizationId) {
      const label =
        employee.firstName || employee.lastName
          ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim()
          : "Employee";
      trackView({ organizationId, entityType: "gabinetEmployees", entityId: employee._id, entityLabel: label });
    }
  }, [employee?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Derived data (used in both layout props and tab content) ---
  // Note: isLoading / notFound are handled by EntityDetailLayout props

  const user = employee ? userMap.get(employee.userId) : undefined;
  const fullName = employee
    ? (employee.firstName || employee.lastName
        ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim()
        : user?.name || user?.email || t("common.unknown"))
    : "";
  const avatarFallback = employee
    ? (employee.firstName?.[0] ?? user?.name?.[0] ?? fullName[0] ?? "?") +
      (employee.lastName?.[0] ?? user?.name?.split(" ")[1]?.[0] ?? fullName[1] ?? "")
    : "?";

  // --- Handlers ---

  const handleDeactivate = async () => {
    if (window.confirm(t("gabinet.employees.confirmDeactivate"))) {
      await removeEmployee({
        organizationId,
        employeeId: employeeId as Id<"gabinetEmployees">,
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetEmployees.list(organizationId) });
      navigate({ to: "/dashboard/gabinet/employees" });
    }
  };

  const validatePasswordForm = (): string | null => {
    if (newPassword.length < 8) return t("gabinet.employees.passwordTooShort");
    if (!/[A-Z]/.test(newPassword)) return t("gabinet.employees.passwordNeedsUppercase");
    if (!/[0-9]/.test(newPassword)) return t("gabinet.employees.passwordNeedsDigit");
    if (newPassword !== confirmPassword) return t("gabinet.employees.passwordMismatch");
    return null;
  };

  const handleChangePassword = async () => {
    const validationError = validatePasswordForm();
    if (validationError) {
      setChangePasswordError(validationError);
      return;
    }
    setChangePasswordSubmitting(true);
    setChangePasswordError(null);
    try {
      await changeEmployeePassword({
        organizationId,
        employeeId,
        newPassword,
      });
      toast.success(t("gabinet.employees.changePasswordSuccess"));
      setChangePasswordOpen(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setChangePasswordError(formatActionError(e));
    } finally {
      setChangePasswordSubmitting(false);
    }
  };

  const handleAddTreatment = async (treatmentId: string) => {
    if (!employee) return;
    const updated = [...employee.qualifiedTreatmentIds, treatmentId] as Id<"gabinetTreatments">[];
    await setQualifiedTreatments({
      organizationId,
      employeeId: employeeId as Id<"gabinetEmployees">,
      treatmentIds: updated,
    });
    invalidateEmployeeCache();
    setTreatmentSearch("");
  };

  const handleRemoveTreatment = async (treatmentId: string) => {
    if (!employee) return;
    const updated = employee.qualifiedTreatmentIds.filter((id) => id !== treatmentId);
    await setQualifiedTreatments({
      organizationId,
      employeeId: employeeId as Id<"gabinetEmployees">,
      treatmentIds: updated as Id<"gabinetTreatments">[],
    });
    invalidateEmployeeCache();
  };

  const handleUpdateActivity = async (data: {
    activityId: string;
    title?: string;
    activityType?: string;
    dueDate?: number;
    endDate?: number;
    description?: string;
  }) => {
    await updateScheduledActivity({
      organizationId,
      activityId: data.activityId as Id<"scheduledActivities">,
      title: data.title,
      activityType: data.activityType,
      dueDate: data.dueDate,
      endDate: data.endDate,
      description: data.description,
    });
  };

  const handleDeleteActivity = async (activityId: string) => {
    await removeScheduledActivity({
      organizationId,
      activityId: activityId as Id<"scheduledActivities">,
    });
    setActivityDrawerOpen(false);
    setSelectedActivityId(null);
  };

  const handleToggleActivityComplete = async (activityId: string, isCompleted: boolean) => {
    if (isCompleted) {
      await markActivityComplete({ organizationId, activityId: activityId as Id<"scheduledActivities"> });
    } else {
      await markActivityIncomplete({ organizationId, activityId: activityId as Id<"scheduledActivities"> });
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setIsAddingNote(true);
    try {
      await createNote({
        organizationId,
        entityType: "gabinetEmployee",
        entityId: employeeId,
        content: newNote.trim(),
      });
      setNewNote("");
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.employees.errors.noteFailed",
          defaultValue: "Nie udało się dodać notatki.",
        }),
      );
    } finally {
      setIsAddingNote(false);
    }
  };

  // Detail fields for EntityDetailLayout sidebar
  const detailFields: DetailField[] = employee
    ? [
        { label: t("gabinet.employees.firstName"), value: employee.firstName, fieldKey: "firstName" },
        { label: t("gabinet.employees.lastName"), value: employee.lastName, fieldKey: "lastName" },
        { label: t("common.email"), value: user?.email, fieldKey: "email" },
        {
          label: t("gabinet.employees.role"),
          value: t(`gabinet.employees.roles.${employee.role}`),
          fieldKey: "role",
        },
        { label: t("gabinet.employees.specialization"), value: employee.specialization, fieldKey: "specialization" },
        { label: t("gabinet.employees.license"), value: employee.licenseNumber, fieldKey: "licenseNumber" },
        { label: t("gabinet.employees.hireDate"), value: employee.hireDate, fieldKey: "hireDate" },
        {
          label: t("gabinet.employees.color"),
          value: employee.color ? (
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-4 w-4 rounded-full border"
                style={{ backgroundColor: employee.color }}
              />
              {employee.color}
            </span>
          ) : undefined,
          fieldKey: "color",
        },
        {
          label: t("common.created"),
          value: new Date(employee.createdAt).toLocaleDateString("pl-PL", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
          fieldKey: "createdAt",
        },
      ]
    : [];

  // Actions dropdown menu
  const actionsMenu = !employee ? undefined : (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {t("detail.actions.actions")}
          <ChevronDown className="ml-1 h-4 w-4" variant="stroke" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setEditDrawerOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" variant="stroke" />
          {t("gabinet.employees.editEmployee")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleDeactivate}
          className="text-destructive focus:text-destructive"
        >
          {t("gabinet.employees.deactivate")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Sidebar extra: notes card + treatment qualifications card
  const sidebarExtra = !employee ? undefined : (
    <>
      {employee.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("gabinet.employees.detailedData.notesComments")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              <PlateText value={employee.notes} />
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("gabinet.employees.qualifications")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {employee.qualifiedTreatmentIds.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {employee.qualifiedTreatmentIds.map((tid) => (
                <Badge key={tid} variant="secondary" className="gap-1 pr-1">
                  {treatmentMap.get(tid) || "..."}
                  <button
                    type="button"
                    className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                    onClick={() => handleRemoveTreatment(tid)}
                  >
                    <X className="h-[18px] w-[18px]" variant="stroke" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("gabinet.employees.noQualifications")}
            </p>
          )}

          <div className="relative">
            <div className="flex items-center w-full rounded-md border bg-transparent">
              <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" variant="stroke" />
              <input
                type="text"
                className="h-8 w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
                placeholder={t("gabinet.employees.addTreatment")}
                value={treatmentSearch}
                onChange={(e) => setTreatmentSearch(e.target.value)}
              />
            </div>
            {treatmentSearch.length > 0 && availableTreatments.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
                <ul className="max-h-[200px] overflow-y-auto p-1">
                  {availableTreatments.map((tr) => (
                    <li key={tr._id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                        onClick={() => handleAddTreatment(tr._id)}
                      >
                        {tr.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {treatmentSearch.length > 0 && availableTreatments.length === 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
                <div className="py-3 px-3 text-sm text-muted-foreground">
                  {t("detail.relationships.noResults")}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );

  // Header subtitle with color swatch, role badge, and inactive badge
  const headerSubtitle = !employee ? undefined : (
    <div className="flex items-center gap-2">
      {employee.color && (
        <span
          className="h-4 w-4 rounded-full"
          style={{ backgroundColor: employee.color }}
        />
      )}
      <Badge variant={employee.isActive ? "default" : "secondary"}>
        {t(`gabinet.employees.roles.${employee.role}`)}
      </Badge>
      {!employee.isActive && (
        <Badge variant="outline" className="text-muted-foreground">
          {t("common.inactive")}
        </Badge>
      )}
    </div>
  );

  // Tabs definition
  const tabs = !employee ? [] : [
    {
      label: t("gabinet.employees.tabs.agenda"),
      content: (
        <UpcomingAgenda
          appointments={employeeAppointments}
          treatmentMap={treatmentMap}
          navigate={navigate}
          t={t}
          i18nLanguage={i18n.language}
        />
      ),
    },
    {
      label: t("gabinet.employees.tabs.terminarz"),
      content: (
        <UpcomingAgenda
          appointments={employeeAppointments}
          treatmentMap={treatmentMap}
          navigate={navigate}
          t={t}
          i18nLanguage={i18n.language}
        />
      ),
    },
    {
      label: t("gabinet.employees.tabs.appointments"),
      content: (
        <AppointmentsTabContent
          employeeAppointments={employeeAppointments}
          calendarWeekStart={calendarWeekStart}
          setCalendarWeekStart={setCalendarWeekStart}
          calendarWeekDates={calendarWeekDates}
          calendarAppointments={calendarAppointments}
          appointmentsView={appointmentsView}
          setAppointmentsView={setAppointmentsView}
          treatmentMap={treatmentMap}
          navigate={navigate}
          t={t}
          i18nLanguage={i18n.language}
        />
      ),
    },
    {
      label: t("gabinet.employees.tabs.patients"),
      count: employeePatients?.length,
      content: (
        <PatientsTabContent
          employeePatients={employeePatients}
          filteredClients={filteredClients}
          clientSearch={clientSearch}
          setClientSearch={setClientSearch}
          clientStatusFilter={clientStatusFilter}
          setClientStatusFilter={setClientStatusFilter}
          clientTreatmentFilter={clientTreatmentFilter}
          setClientTreatmentFilter={setClientTreatmentFilter}
          treatments={treatments}
          navigate={navigate}
          t={t}
          i18nLanguage={i18n.language}
        />
      ),
    },
    {
      label: t("gabinet.employees.tabs.detailedData"),
      content: (
        <DetailedDataTab
          employee={employee}
          userEmail={user?.email}
          treatments={treatments}
          treatmentMap={treatmentMap}
          organizationId={organizationId}
          role={role}
          onChangePassword={() => {
            setNewPassword("");
            setConfirmPassword("");
            setChangePasswordError(null);
            setChangePasswordOpen(true);
          }}
          onUpdate={async (a) => { await updateEmployee(a); invalidateEmployeeCache(); }}
          onSetTreatments={async (a) => { await setQualifiedTreatments(a); invalidateEmployeeCache(); }}
          t={t}
          i18nLanguage={i18n.language}
        />
      ),
    },
    {
      label: t("gabinet.employees.tabs.schedule"),
      content: (
        <FlexibleScheduleEditor
          organizationId={organizationId}
          userId={employee.userId as Id<"users">}
          periods={schedulePeriods}
          clinicHours={clinicHours ?? []}
          onSavePeriod={async (a) => { await saveSchedulePeriod(a); invalidateScheduleCache(); }}
          onRemovePeriod={async (a) => { await removeSchedulePeriod(a); invalidateScheduleCache(); }}
          onSaveLegacy={async (a) => { await bulkSetEmployeeSchedule(a); invalidateScheduleCache(); }}
          onManageLeaves={() => navigate({ to: "/dashboard/gabinet/settings/leaves" })}
        />
      ),
    },
    {
      label: t("gabinet.employees.tabs.documents", "Dokumenty"),
      count: employeeDocuments?.length ?? 0,
      content: (
        <EntityDocumentsTab
          entityType="employee"
          entityId={employeeId}
          organizationId={organizationId}
        />
      ),
    },
    {
      label: t("gabinet.employees.tabs.assignedItems"),
      count: employee.assignedItems?.filter((it) => !it.returnedDate).length,
      content: (
        <AssignedItemsTab
          employee={employee}
          organizationId={organizationId}
          onUpdate={async (a) => { await updateEmployee(a); invalidateEmployeeCache(); }}
          t={t}
        />
      ),
    },
    {
      label: t("gabinet.employees.tabs.notes"),
      content: (
        <NotesTabContent
          notesData={notesData}
          newNote={newNote}
          setNewNote={setNewNote}
          isAddingNote={isAddingNote}
          setIsAddingNote={setIsAddingNote}
          handleAddNote={handleAddNote}
          t={t}
        />
      ),
    },
    {
      label: t("gabinet.employees.activity"),
      content: (
        <ActivityFeed
          entries={activitiesToFeedEntries(activities ?? [], t)}
          maxHeight="600px"
        />
      ),
    },
    ...(role === "admin" || role === "owner"
      ? [
          {
            label: t("gabinet.employees.tabs.permissions", "Uprawnienia"),
            content: (
              <EmployeePermissionsTab
                organizationId={organizationId}
                userId={employee.userId as Id<"users">}
                gabinetRole={employee.role}
                t={t}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <EntityDetailLayout
        variant="default"
        isLoading={isLoading}
        notFound={!employee && !isLoading}
        onBack={() => navigate({ to: "/dashboard/gabinet/employees" })}
        title={fullName}
        headerSubtitle={headerSubtitle}
        avatarFallback={avatarFallback}
        actionsMenu={actionsMenu}
        fields={detailFields}
        expandedFieldCount={5}
        sidebarExtra={sidebarExtra}
        tabs={tabs}
        defaultTab={t("gabinet.employees.tabs.agenda")}
        beforeTabs={
          <EmployeeNavGroups
            activeGroup={activeNavGroup}
            onGroupChange={setActiveNavGroup}
            t={t}
          />
        }
      />

      {/* Edit employee drawer */}
      {employee && (
        <EditEmployeeDrawer
          open={editDrawerOpen}
          onOpenChange={setEditDrawerOpen}
          employee={employee}
          organizationId={organizationId}
          members={members ?? []}
          allEmployees={allEmployees ?? []}
          onUpdate={async (a) => { await updateEmployee(a); invalidateEmployeeCache(); }}
          isSubmitting={isSubmitting}
          setIsSubmitting={setIsSubmitting}
          t={t}
        />
      )}

      {/* Activity detail drawer */}
      <ActivityDetailDrawer
        open={activityDrawerOpen}
        onOpenChange={(open) => {
          setActivityDrawerOpen(open);
          if (!open) setSelectedActivityId(null);
        }}
        activity={selectedActivity}
        activityTypeDefs={activityTypeDefs}
        onUpdate={handleUpdateActivity}
        onDelete={handleDeleteActivity}
        onToggleComplete={handleToggleActivityComplete}
        isSubmitting={isSubmitting}
      />

      {/* Change password dialog */}
      <Dialog
        open={changePasswordOpen}
        onOpenChange={(open) => {
          if (!changePasswordSubmitting) setChangePasswordOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("gabinet.employees.changePasswordTitle")}</DialogTitle>
            <DialogDescription>
              {t("gabinet.employees.changePasswordDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-password">{t("gabinet.employees.newPassword")}</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setChangePasswordError(null);
                }}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t("gabinet.employees.confirmPassword")}</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setChangePasswordError(null);
                }}
                autoComplete="new-password"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("gabinet.employees.passwordRequirements")}
            </p>
            {changePasswordError && (
              <p className="text-sm text-destructive">{changePasswordError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setChangePasswordOpen(false)}
              disabled={changePasswordSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleChangePassword} disabled={changePasswordSubmitting}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// --- Employee main navigation groups ---

const EMPLOYEE_NAV_GROUPS = [
  "clientsAndVisits",
  "schedule",
  "employeeData",
  "documentsAndAssets",
  "accountAndAccess",
] as const;

function EmployeeNavGroups({
  activeGroup,
  onGroupChange,
  t,
}: {
  activeGroup: string;
  onGroupChange: (group: string) => void;
  t: TFunction;
}) {
  return (
    <div className="-mx-4 mb-1 overflow-x-auto px-4 scrollbar-none">
      <div className="flex min-w-max gap-1 pb-1">
        {EMPLOYEE_NAV_GROUPS.map((group) => {
          const isActive = activeGroup === group;
          return (
            <button
              key={group}
              type="button"
              onClick={() => onGroupChange(group)}
              className={[
                "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              {t(`gabinet.employees.navGroups.${group}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- Extracted tab content components ---

function AppointmentsTabContent({
  employeeAppointments,
  calendarWeekStart,
  setCalendarWeekStart,
  calendarWeekDates,
  calendarAppointments,
  appointmentsView,
  setAppointmentsView,
  treatmentMap,
  navigate,
  t,
  i18nLanguage,
}: {
  employeeAppointments: MappedGabinetAppointment[] | undefined;
  calendarWeekStart: string;
  setCalendarWeekStart: (v: string) => void;
  calendarWeekDates: string[];
  calendarAppointments: MappedGabinetAppointment[];
  appointmentsView: "calendar" | "list";
  setAppointmentsView: (v: "calendar" | "list") => void;
  treatmentMap: Map<string, string>;
  navigate: (opts: { to: string }) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  i18nLanguage: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {t("gabinet.employees.tabs.appointments")}
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border">
            <Button
              size="sm"
              variant={appointmentsView === "calendar" ? "default" : "ghost"}
              className="rounded-r-none h-8 px-3"
              onClick={() => setAppointmentsView("calendar")}
            >
              <Calendar className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={appointmentsView === "list" ? "default" : "ghost"}
              className="rounded-l-none h-8 px-3"
              onClick={() => setAppointmentsView("list")}
            >
              <ClipboardList className="h-4 w-4" />
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate({ to: "/dashboard/gabinet/calendar" })}
          >
            <Plus className="mr-1 h-4 w-4" variant="stroke" />
            {t("gabinet.appointments.createAppointment")}
          </Button>
        </div>
      </div>

      {!employeeAppointments || employeeAppointments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Calendar className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {t("gabinet.appointments.noAppointments")}
          </p>
        </div>
      ) : appointmentsView === "calendar" ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date(calendarWeekStart + "T00:00:00");
                d.setDate(d.getDate() - 7);
                setCalendarWeekStart(d.toISOString().split("T")[0]);
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {new Date(calendarWeekDates[0] + "T00:00:00").toLocaleDateString(i18nLanguage, { day: "numeric", month: "short" })}
                {" – "}
                {new Date(calendarWeekDates[6] + "T00:00:00").toLocaleDateString(i18nLanguage, { day: "numeric", month: "short", year: "numeric" })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const now = new Date();
                  const day = now.getDay();
                  const diff = day === 0 ? -6 : 1 - day;
                  const monday = new Date(now);
                  monday.setDate(now.getDate() + diff);
                  setCalendarWeekStart(monday.toISOString().split("T")[0]);
                }}
              >
                {t("gabinet.employees.appointmentsView.today")}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date(calendarWeekStart + "T00:00:00");
                d.setDate(d.getDate() + 7);
                setCalendarWeekStart(d.toISOString().split("T")[0]);
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-7 border-b bg-muted/50">
              {calendarWeekDates.map((date) => {
                const d = new Date(date + "T00:00:00");
                const isToday = date === new Date().toISOString().split("T")[0];
                return (
                  <div
                    key={date}
                    className={`px-2 py-2 text-center text-xs font-medium ${isToday ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
                  >
                    <div>{d.toLocaleDateString(i18nLanguage, { weekday: "short" })}</div>
                    <div className={`text-lg ${isToday ? "font-bold" : ""}`}>{d.getDate()}</div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-7 min-h-[300px]">
              {calendarWeekDates.map((date) => {
                const dayApts = calendarAppointments
                  .filter((a) => a.date === date)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime));
                return (
                  <div key={date} className="border-r last:border-r-0 p-1 space-y-1">
                    {dayApts.map((apt) => {
                      const tName = apt.treatmentId ? treatmentMap.get(apt.treatmentId) : undefined;
                      const statusColors: Record<string, string> = {
                        scheduled: "bg-blue-50 border-blue-200 text-blue-800",
                        confirmed: "bg-green-50 border-green-200 text-green-800",
                        in_progress: "bg-yellow-50 border-yellow-200 text-yellow-800",
                        completed: "bg-gray-50 border-gray-200 text-gray-600",
                        cancelled: "bg-red-50 border-red-200 text-red-400",
                        no_show: "bg-orange-50 border-orange-200 text-orange-400",
                      };
                      const cls = statusColors[apt.status] ?? statusColors.scheduled;
                      return (
                        <div
                          key={apt._id}
                          className={`rounded border-l-2 px-1.5 py-1 text-xs cursor-pointer hover:opacity-80 ${cls}`}
                          onClick={() =>
                            navigate({ to: `/dashboard/gabinet/appointments/${apt._id}` })
                          }
                        >
                          <div className="font-medium truncate">{apt.startTime}–{apt.endTime}</div>
                          <div className="truncate opacity-75">{tName ?? t("common.unknown")}</div>
                        </div>
                      );
                    })}
                    {dayApts.length === 0 && (
                      <div className="h-full min-h-[60px]" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {calendarAppointments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              {t("gabinet.employees.appointmentsView.noAppointmentsThisWeek")}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {[...employeeAppointments]
            .sort((a, b) =>
              (b.date + b.startTime).localeCompare(a.date + a.startTime)
            )
            .map((apt) => {
              const treatmentName = apt.treatmentId ? treatmentMap.get(apt.treatmentId) : undefined;
              const isPast = apt.date < new Date().toISOString().split("T")[0];
              return (
                <div
                  key={apt._id}
                  className={`flex items-center gap-4 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors ${isPast ? "opacity-60" : ""}`}
                  onClick={() =>
                    navigate({ to: `/dashboard/gabinet/appointments/${apt._id}` })
                  }
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Calendar className="h-4 w-4 text-primary" variant="stroke" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {treatmentName ?? t("common.unknown")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {apt.date} &middot; {apt.startTime}–{apt.endTime}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={appointmentStatusBadgeClass(apt.status)}
                  >
                    {t(`gabinet.appointments.statuses.${apt.status}`)}
                  </Badge>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function PatientsTabContent({
  employeePatients,
  filteredClients,
  clientSearch,
  setClientSearch,
  clientStatusFilter,
  setClientStatusFilter,
  clientTreatmentFilter,
  setClientTreatmentFilter,
  treatments,
  navigate,
  t,
  i18nLanguage,
}: {
  employeePatients: EmployeePatientStats[] | undefined;
  filteredClients: EmployeePatientStats[];
  clientSearch: string;
  setClientSearch: (v: string) => void;
  clientStatusFilter: string;
  setClientStatusFilter: (v: string) => void;
  clientTreatmentFilter: string;
  setClientTreatmentFilter: (v: string) => void;
  treatments: Array<{ _id: string; name: string }> | undefined;
  navigate: (opts: { to: string }) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  i18nLanguage: string;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {t("gabinet.employees.tabs.patients")}
      </h3>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("gabinet.employees.clientsTab.searchPlaceholder")}
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            className="pl-9 h-9"
          />
          {clientSearch && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1 h-7 w-7 p-0"
              onClick={() => setClientSearch("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        <Select value={clientStatusFilter} onValueChange={setClientStatusFilter}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder={t("gabinet.employees.clientsTab.filterByStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("gabinet.employees.clientsTab.allStatuses")}</SelectItem>
            <SelectItem value="scheduled">{t("gabinet.appointments.statuses.scheduled")}</SelectItem>
            <SelectItem value="confirmed">{t("gabinet.appointments.statuses.confirmed")}</SelectItem>
            <SelectItem value="completed">{t("gabinet.appointments.statuses.completed")}</SelectItem>
            <SelectItem value="cancelled">{t("gabinet.appointments.statuses.cancelled")}</SelectItem>
            <SelectItem value="no_show">{t("gabinet.appointments.statuses.no_show")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={clientTreatmentFilter} onValueChange={setClientTreatmentFilter}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder={t("gabinet.employees.clientsTab.filterByTreatment")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("gabinet.employees.clientsTab.allTreatments")}</SelectItem>
            {treatments?.map((tr) => (
              <SelectItem key={tr._id} value={tr._id}>
                {tr.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(clientSearch || clientStatusFilter !== "all" || clientTreatmentFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              setClientSearch("");
              setClientStatusFilter("all");
              setClientTreatmentFilter("all");
            }}
          >
            <X className="h-3 w-3 mr-1" />
            {t("gabinet.employees.clientsTab.clearFilters")}
          </Button>
        )}
      </div>

      {employeePatients && employeePatients.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("gabinet.employees.clientsTab.showing", {
            count: filteredClients.length,
            total: employeePatients.length,
          })}
        </p>
      )}

      {!employeePatients || employeePatients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <User className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {t("gabinet.employees.tabs.noPatients")}
          </p>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Search className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            {t("gabinet.employees.clientsTab.noResults")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredClients.map((pat) => (
            <div
              key={pat._id}
              className="flex items-center gap-4 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() =>
                navigate({
                  to: `/dashboard/gabinet/patients/${pat._id}`,
                })
              }
            >
              <Avatar className="h-9 w-9 border">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {pat.firstName[0]}
                  {pat.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {pat.firstName} {pat.lastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pat.email}
                  {pat.phone && ` · ${formatPhoneNumber(pat.phone)}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-xs">
                  {t("gabinet.employees.clientsTab.visits", { count: pat.visitCount })}
                </Badge>
                {pat.lastVisitDate && (
                  <span className="text-xs text-muted-foreground">
                    {t("gabinet.employees.clientsTab.lastVisit")}{" "}
                    {new Date(pat.lastVisitDate + "T00:00:00").toLocaleDateString(i18nLanguage, { day: "numeric", month: "short" })}
                  </span>
                )}
                {!pat.isActive && (
                  <Badge variant="outline" className="text-muted-foreground">
                    {t("common.inactive")}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotesTabContent({
  notesData,
  newNote,
  setNewNote,
  isAddingNote,
  setIsAddingNote,
  handleAddNote,
  t,
}: {
  notesData: Array<{ _id: string; content: string; createdAt: number }> | undefined;
  newNote: string;
  setNewNote: (v: string) => void;
  isAddingNote: boolean;
  setIsAddingNote: (v: boolean) => void;
  handleAddNote: () => Promise<void>;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{t("detail.notes.title")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("detail.notes.descriptionAlt")}
          </p>
        </div>
        <Button
          className="bg-primary"
          onClick={() => setIsAddingNote(true)}
        >
          <Plus className="h-4 w-4 mr-1" variant="stroke" />
          {t("detail.notes.add")}
        </Button>
      </div>

      {isAddingNote && (
        <div className="space-y-2 rounded-lg border p-4">
          <RichTextEditor
            value={newNote}
            onChange={(val) => setNewNote(val ?? "")}
            placeholder={t("detail.notes.placeholderAlt")}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAddingNote(false);
                setNewNote("");
              }}
            >
              {t("detail.notes.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleAddNote}
              disabled={!newNote.trim()}
            >
              {t("detail.notes.save")}
            </Button>
          </div>
        </div>
      )}

      {notesData && notesData.length > 0 ? (
        <ul className="space-y-3">
          {notesData.map((note) => (
            <li
              key={note._id}
              className="rounded-lg border p-4 space-y-1"
            >
              <p className="text-sm whitespace-pre-wrap">{plateJsonToText(note.content as string)}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(note.createdAt).toLocaleDateString("pl-PL", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        !isAddingNote && (
          <p className="text-sm text-muted-foreground">
            {t("detail.notes.empty")}
          </p>
        )
      )}
    </div>
  );
}

// --- Edit drawer ---

function EditEmployeeDrawer({
  open,
  onOpenChange,
  employee,
  organizationId,
  members,
  allEmployees,
  onUpdate,
  isSubmitting,
  setIsSubmitting,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: MappedGabinetEmployee;
  organizationId: Id<"organizations">;
  members: Array<{ userId: string; user: { name?: string | null; email?: string | null } | null }>;
  allEmployees: MappedGabinetEmployee[];
  onUpdate: (args: FunctionArgs<typeof api.gabinet.employees.update>) => Promise<void>;
  isSubmitting: boolean;
  setIsSubmitting: (v: boolean) => void;
  t: TFunction;
}) {
  const [userId, setUserId] = useState<string>(employee.userId);
  const [firstName, setFirstName] = useState(employee.firstName ?? "");
  const [lastName, setLastName] = useState(employee.lastName ?? "");
  const [role, setRole] = useState<GabinetEmployeeRole>(employee.role as GabinetEmployeeRole);
  const [specialization, setSpecialization] = useState(employee.specialization ?? "");
  const [licenseNumber, setLicenseNumber] = useState(employee.licenseNumber ?? "");
  const [hireDate, setHireDate] = useState(employee.hireDate ?? "");
  const [color, setColor] = useState(employee.color ?? "#3b82f6");
  const [showInCalendar, setShowInCalendar] = useState<boolean>(
    employee.showInCalendar ?? true,
  );
  const [notes, setNotes] = useState(employee.notes ?? "");

  // Re-sync form state when drawer opens
  useEffect(() => {
    if (open) {
      setUserId(employee.userId);
      setFirstName(employee.firstName ?? "");
      setLastName(employee.lastName ?? "");
      setRole(employee.role as GabinetEmployeeRole);
      setSpecialization(employee.specialization ?? "");
      setLicenseNumber(employee.licenseNumber ?? "");
      setHireDate(employee.hireDate ?? "");
      setColor(employee.color ?? "#3b82f6");
      setShowInCalendar(employee.showInCalendar ?? true);
      setNotes(employee.notes ?? "");
    }
  }, [open, employee]);

  // Org members eligible for linking: current user + any user not linked to another employee
  const availableUsers = useMemo(() => {
    const takenUserIds = new Set(
      allEmployees
        .filter((e) => e._id !== employee._id)
        .map((e) => e.userId),
    );
    return members
      .filter((m) => m.user && (m.userId === employee.userId || !takenUserIds.has(m.userId)))
      .map((m) => ({
        userId: m.userId,
        label: m.user!.name || m.user!.email || m.userId,
      }));
  }, [members, allEmployees, employee._id, employee.userId]);

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      await onUpdate({
        organizationId,
        employeeId: employee._id,
        userId: userId !== employee.userId ? userId : undefined,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        role,
        specialization: specialization || null,
        licenseNumber: licenseNumber || null,
        hireDate: hireDate || null,
        color: color || null,
        showInCalendar,
        notes: notes || null,
      });
      toast.success(t("common.saved"));
      onOpenChange(false);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.employees.errors.saveFailed",
          defaultValue: "Nie udało się zapisać zmian pracownika.",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={t("gabinet.employees.editEmployee")}
      onSubmit={handleSave}
      submitLabel={t("common.save")}
      isSubmitting={isSubmitting}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t("gabinet.employees.selectUser")}</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger>
              <SelectValue placeholder={t("gabinet.employees.selectUserPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {availableUsers.map((u) => (
                <SelectItem key={u.userId} value={u.userId}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("gabinet.employees.firstName")}</Label>
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("gabinet.employees.lastName")}</Label>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("gabinet.employees.role")}</Label>
          <Select value={role} onValueChange={(v) => setRole(v as GabinetEmployeeRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`gabinet.employees.roles.${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t("gabinet.employees.specialization")}</Label>
          <Input
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t("gabinet.employees.license")}</Label>
          <Input
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t("gabinet.employees.hireDate")}</Label>
          <Input
            type="date"
            value={hireDate}
            onChange={(e) => setHireDate(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t("gabinet.employees.color")}</Label>
          <input
            type="color"
            className="h-9 w-16 cursor-pointer rounded border bg-transparent"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              className="mt-0.5 h-5 w-5"
              checked={showInCalendar}
              onCheckedChange={(checked) => setShowInCalendar(checked === true)}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium leading-none">
                {t("gabinet.employees.showInCalendar")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("gabinet.employees.showInCalendarHint")}
              </span>
            </span>
          </label>
        </div>

        <div className="space-y-1.5">
          <Label>{t("gabinet.employees.notes")}</Label>
          <RichTextEditor
            value={notes}
            onChange={(val) => setNotes(val ?? "")}
          />
        </div>
      </div>
    </SidePanel>
  );
}

// --- Upcoming Agenda component ---

function UpcomingAgenda({
  appointments,
  treatmentMap,
  navigate,
  t,
  i18nLanguage,
}: {
  appointments: MappedGabinetAppointment[] | undefined;
  treatmentMap: Map<string, string>;
  navigate: (opts: { to: string }) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  i18nLanguage: string;
}) {
  const today = new Date().toISOString().split("T")[0];

  // Filter upcoming (today + future), non-cancelled
  const upcoming = useMemo(() => {
    if (!appointments) return [];
    return appointments
      .filter((a) => a.date >= today && a.status !== "cancelled" && a.status !== "no_show")
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  }, [appointments, today]);

  // Group by date
  const groupedByDay = useMemo(() => {
    const groups = new Map<string, typeof upcoming>();
    for (const apt of upcoming) {
      if (!groups.has(apt.date)) groups.set(apt.date, []);
      groups.get(apt.date)!.push(apt);
    }
    return [...groups.entries()].slice(0, 7); // Show up to 7 days
  }, [upcoming]);

  const formatDayHeader = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    if (dateStr === today) return t("gabinet.employees.agenda.today");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dateStr === tomorrow.toISOString().split("T")[0])
      return t("gabinet.employees.agenda.tomorrow");
    return d.toLocaleDateString(i18nLanguage, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  if (!appointments) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (upcoming.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-1">
          {t("gabinet.employees.agenda.empty")}
        </h3>
        <p className="text-sm text-muted-foreground/70">
          {t("gabinet.employees.agenda.emptyHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {t("gabinet.employees.agenda.title")}
        </h3>
        <Badge variant="outline">
          {t("gabinet.employees.agenda.upcoming", { count: upcoming.length })}
        </Badge>
      </div>

      {groupedByDay.map(([date, dayAppointments]) => {
        const isToday = date === today;
        return (
          <div key={date}>
            <div className={`flex items-center gap-2 mb-3 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
              <div className={`h-2 w-2 rounded-full ${isToday ? "bg-primary" : "bg-muted-foreground/40"}`} />
              <h4 className="text-sm font-semibold uppercase tracking-wide">
                {formatDayHeader(date)}
              </h4>
              <span className="text-xs">
                ({dayAppointments.length})
              </span>
            </div>
            <div className="space-y-2 ml-4">
              {dayAppointments.map((apt) => {
                const treatmentName = apt.treatmentId ? treatmentMap.get(apt.treatmentId) : undefined;
                const durationMin = (() => {
                  const [sh, sm] = apt.startTime.split(":").map(Number);
                  const [eh, em] = apt.endTime.split(":").map(Number);
                  return (eh * 60 + em) - (sh * 60 + sm);
                })();
                return (
                  <div
                    key={apt._id}
                    className="flex items-center gap-4 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() =>
                      navigate({ to: `/dashboard/gabinet/appointments/${apt._id}` })
                    }
                  >
                    <div className="flex flex-col items-center justify-center min-w-[60px] text-center">
                      <span className="text-sm font-bold">{apt.startTime}</span>
                      <span className="text-[10px] text-muted-foreground">{apt.endTime}</span>
                    </div>
                    <div className="h-10 w-0.5 rounded-full bg-primary/30" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {treatmentName ?? t("common.unknown")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {durationMin} {t("gabinet.employees.agenda.minutes")}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs ${appointmentStatusBadgeClass(apt.status)}`}
                    >
                      {t(`gabinet.appointments.statuses.${apt.status}`)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Detailed Data tab component ---

const EMPLOYMENT_TYPES = ["umowa_o_prace", "umowa_zlecenie", "b2b", "staz"] as const;
type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

function DetailedDataTab({
  employee,
  userEmail,
  treatments,
  treatmentMap,
  organizationId,
  role,
  onChangePassword,
  onUpdate,
  onSetTreatments,
  t,
  i18nLanguage,
}: {
  employee: MappedGabinetEmployee;
  userEmail?: string | null;
  treatments: Array<{ _id: string; name: string }> | undefined;
  treatmentMap: Map<string, string>;
  organizationId: Id<"organizations">;
  role?: string | null;
  onChangePassword?: () => void;
  onUpdate: (args: FunctionArgs<typeof api.gabinet.employees.update>) => Promise<void>;
  onSetTreatments: (args: FunctionArgs<typeof api.gabinet.employees.setQualifiedTreatments>) => Promise<void>;
  t: TFunction;
  i18nLanguage: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state mirrors
  const [formData, setFormData] = useState({
    firstName: employee.firstName ?? "",
    lastName: employee.lastName ?? "",
    phone: employee.phone ?? "",
    email: employee.email ?? "",
    dateOfBirth: parseBirthDateToIso(employee.dateOfBirth),
    pesel: employee.pesel ?? "",
    addressStreet: employee.address?.street ?? "",
    addressCity: employee.address?.city ?? "",
    addressPostalCode: employee.address?.postalCode ?? "",
    employmentType: employee.employmentType ?? "",
    hireDate: employee.hireDate ?? "",
    endDate: employee.endDate ?? "",
    position: employee.position ?? "",
    department: employee.department ?? "",
    role: employee.role,
    notes: employee.notes ?? "",
    skills: (employee.skills ?? []).join(", "),
    yearsOfExperience: employee.yearsOfExperience?.toString() ?? "",
    baseSalary: employee.baseSalary?.toString() ?? "",
    commissionPercent: employee.commissionPercent?.toString() ?? "",
    bankAccount: employee.bankAccount ?? "",
  });

  // Certifications state
  const [certifications, setCertifications] = useState(
    employee.certifications ?? []
  );
  const [newCertName, setNewCertName] = useState("");
  const [newCertDate, setNewCertDate] = useState("");
  const [newCertExpiry, setNewCertExpiry] = useState("");

  // Treatment search for assignment
  const [treatmentSearchLocal, setTreatmentSearchLocal] = useState("");
  const availableTreatmentsLocal = useMemo(() => {
    if (!treatments || !employee) return [];
    const assignedSet = new Set(employee.qualifiedTreatmentIds);
    const filtered = treatments.filter((tr) => !assignedSet.has(tr._id));
    if (!treatmentSearchLocal) return filtered;
    const q = treatmentSearchLocal.toLowerCase();
    return filtered.filter((tr) => tr.name.toLowerCase().includes(q));
  }, [treatments, employee, treatmentSearchLocal]);

  // Re-sync form when employee data changes
  useEffect(() => {
    setFormData({
      firstName: employee.firstName ?? "",
      lastName: employee.lastName ?? "",
      phone: employee.phone ?? "",
      email: employee.email ?? "",
      dateOfBirth: parseBirthDateToIso(employee.dateOfBirth),
      pesel: employee.pesel ?? "",
      addressStreet: employee.address?.street ?? "",
      addressCity: employee.address?.city ?? "",
      addressPostalCode: employee.address?.postalCode ?? "",
      employmentType: employee.employmentType ?? "",
      hireDate: employee.hireDate ?? "",
      endDate: employee.endDate ?? "",
      position: employee.position ?? "",
      department: employee.department ?? "",
      role: employee.role,
      notes: employee.notes ?? "",
      skills: (employee.skills ?? []).join(", "),
      yearsOfExperience: employee.yearsOfExperience?.toString() ?? "",
      baseSalary: employee.baseSalary?.toString() ?? "",
      commissionPercent: employee.commissionPercent?.toString() ?? "",
      bankAccount: employee.bankAccount ?? "",
    });
    setCertifications(employee.certifications ?? []);
  }, [employee]);

  const startEdit = (section: string) => {
    setEditing(section);
  };

  const cancelEdit = () => {
    setEditing(null);
    // Reset form data
    setFormData({
      firstName: employee.firstName ?? "",
      lastName: employee.lastName ?? "",
      phone: employee.phone ?? "",
      email: employee.email ?? "",
      dateOfBirth: parseBirthDateToIso(employee.dateOfBirth),
      pesel: employee.pesel ?? "",
      addressStreet: employee.address?.street ?? "",
      addressCity: employee.address?.city ?? "",
      addressPostalCode: employee.address?.postalCode ?? "",
      employmentType: employee.employmentType ?? "",
      hireDate: employee.hireDate ?? "",
      endDate: employee.endDate ?? "",
      position: employee.position ?? "",
      department: employee.department ?? "",
      role: employee.role,
      notes: employee.notes ?? "",
      skills: (employee.skills ?? []).join(", "),
      yearsOfExperience: employee.yearsOfExperience?.toString() ?? "",
      baseSalary: employee.baseSalary?.toString() ?? "",
      commissionPercent: employee.commissionPercent?.toString() ?? "",
      bankAccount: employee.bankAccount ?? "",
    });
    setCertifications(employee.certifications ?? []);
  };

  const saveSection = async (section: string) => {
    setSaving(true);
    try {
      const updatePayload: FunctionArgs<typeof api.gabinet.employees.update> = {
        organizationId,
        employeeId: employee._id,
      };

      if (section === "personal") {
        updatePayload.firstName = formData.firstName || undefined;
        updatePayload.lastName = formData.lastName || undefined;
        updatePayload.phone = formData.phone || null;
        updatePayload.email = formData.email || null;
        updatePayload.dateOfBirth = formData.dateOfBirth || null;
        updatePayload.pesel = formData.pesel || null;
        updatePayload.address =
          formData.addressStreet || formData.addressCity || formData.addressPostalCode
            ? {
                street: formData.addressStreet || undefined,
                city: formData.addressCity || undefined,
                postalCode: formData.addressPostalCode || undefined,
              }
            : null;
      } else if (section === "employment") {
        updatePayload.employmentType = (formData.employmentType || null) as EmploymentType | null;
        updatePayload.hireDate = formData.hireDate || null;
        updatePayload.endDate = formData.endDate || null;
        updatePayload.position = formData.position || null;
        updatePayload.department = formData.department || null;
        updatePayload.role = formData.role as GabinetEmployeeRole;
        updatePayload.notes = formData.notes || null;
      } else if (section === "qualifications") {
        const skillsList = formData.skills
          ? formData.skills.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [];
        updatePayload.skills = skillsList.length > 0 ? skillsList : null;
        updatePayload.yearsOfExperience = formData.yearsOfExperience
          ? Number(formData.yearsOfExperience)
          : null;
        updatePayload.certifications =
          certifications.length > 0 ? certifications : null;
      } else if (section === "compensation") {
        updatePayload.baseSalary = formData.baseSalary
          ? Number(formData.baseSalary)
          : null;
        updatePayload.commissionPercent = formData.commissionPercent
          ? Number(formData.commissionPercent)
          : null;
        updatePayload.bankAccount = formData.bankAccount || null;
      }

      await onUpdate(updatePayload);
      toast.success(t("common.saved"));
      setEditing(null);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.employees.errors.saveFailed",
          defaultValue: "Nie udało się zapisać zmian pracownika.",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddCertification = () => {
    if (!newCertName.trim()) return;
    setCertifications([
      ...certifications,
      {
        name: newCertName.trim(),
        dateObtained: newCertDate || undefined,
        expiryDate: newCertExpiry || undefined,
      },
    ]);
    setNewCertName("");
    setNewCertDate("");
    setNewCertExpiry("");
  };

  const handleRemoveCertification = (index: number) => {
    setCertifications(certifications.filter((_, i) => i !== index));
  };

  const handleAddTreatmentLocal = async (treatmentId: string) => {
    const updated = [...employee.qualifiedTreatmentIds, treatmentId];
    await onSetTreatments({
      organizationId,
      employeeId: employee._id,
      treatmentIds: updated,
    });
    setTreatmentSearchLocal("");
  };

  const handleRemoveTreatmentLocal = async (treatmentId: string) => {
    const updated = employee.qualifiedTreatmentIds.filter((id: string) => id !== treatmentId);
    await onSetTreatments({
      organizationId,
      employeeId: employee._id,
      treatmentIds: updated,
    });
  };

  const readOnlyField = (label: string, value: string | undefined | null, icon?: React.ReactNode) => (
    <div className="flex items-start gap-3 py-1.5">
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );

  const sectionHeader = (
    title: string,
    sectionKey: string,
    icon: React.ReactNode,
  ) => (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h4 className="text-base font-semibold">{title}</h4>
      </div>
      {editing !== sectionKey ? (
        <Button variant="ghost" size="sm" onClick={() => startEdit(sectionKey)}>
          <Pencil className="h-3.5 w-3.5 mr-1" variant="stroke" />
          {t("common.edit")}
        </Button>
      ) : (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={cancelEdit}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" onClick={() => saveSection(sectionKey)} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Section: Dane osobowe (Personal Data) */}
      <Card>
        <CardContent className="pt-6">
          {sectionHeader(
            t("gabinet.employees.detailedData.personalData"),
            "personal",
            <User className="h-4 w-4" variant="stroke" />,
          )}
          {editing === "personal" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.firstName")}</Label>
                  <Input
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.lastName")}</Label>
                  <Input
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.phone")}</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+48 ..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.email")}</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.dateOfBirth")}</Label>
                  <Input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.pesel")}</Label>
                  <Input
                    value={formData.pesel}
                    onChange={(e) => setFormData({ ...formData, pesel: e.target.value })}
                    placeholder="00000000000"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.address")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder={t("gabinet.employees.detailedData.street")}
                    value={formData.addressStreet}
                    onChange={(e) => setFormData({ ...formData, addressStreet: e.target.value })}
                    className="col-span-2"
                  />
                  <Input
                    placeholder={t("gabinet.employees.detailedData.postalCode")}
                    value={formData.addressPostalCode}
                    onChange={(e) => setFormData({ ...formData, addressPostalCode: e.target.value })}
                  />
                </div>
                <Input
                  placeholder={t("gabinet.employees.detailedData.city")}
                  value={formData.addressCity}
                  onChange={(e) => setFormData({ ...formData, addressCity: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
              {readOnlyField(t("gabinet.employees.firstName"), employee.firstName)}
              {readOnlyField(t("gabinet.employees.lastName"), employee.lastName)}
              {readOnlyField(
                t("gabinet.employees.detailedData.phone"),
                employee.phone ? formatPhoneNumber(employee.phone) : undefined,
                <Phone className="h-3.5 w-3.5" />,
              )}
              <div className="flex items-start gap-3 py-1.5">
                <span className="mt-0.5 text-muted-foreground"><Mail className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{t("gabinet.employees.detailedData.email")}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{employee.email || userEmail || "—"}</p>
                    {(role === "admin" || role === "owner") && userEmail && onChangePassword && (
                      <Button variant="outline" size="sm" onClick={onChangePassword} className="shrink-0">
                        {t("gabinet.employees.changePassword")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {readOnlyField(
                t("gabinet.employees.detailedData.dateOfBirth"),
                employee.dateOfBirth ? formatBirthDate(employee.dateOfBirth) : undefined,
              )}
              {readOnlyField(t("gabinet.employees.detailedData.pesel"), employee.pesel)}
              {(employee.address?.street || employee.address?.city) &&
                readOnlyField(
                  t("gabinet.employees.detailedData.address"),
                  [employee.address?.street, employee.address?.postalCode, employee.address?.city]
                    .filter(Boolean)
                    .join(", "),
                  <MapPin className="h-3.5 w-3.5" />,
                )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section: Zatrudnienie (Employment) */}
      <Card>
        <CardContent className="pt-6">
          {sectionHeader(
            t("gabinet.employees.detailedData.employment"),
            "employment",
            <Briefcase className="h-4 w-4" variant="stroke" />,
          )}
          {editing === "employment" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.employmentType")}</Label>
                  <Select
                    value={formData.employmentType}
                    onValueChange={(v) => setFormData({ ...formData, employmentType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("gabinet.employees.detailedData.selectEmploymentType")} />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_TYPES.map((et) => (
                        <SelectItem key={et} value={et}>
                          {t(`gabinet.employees.detailedData.employmentTypes.${et}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.position")}</Label>
                  <Input
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    placeholder={t("gabinet.employees.detailedData.positionPlaceholder")}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.hireDate")}</Label>
                  <Input
                    type="date"
                    value={formData.hireDate}
                    onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.endDate")}</Label>
                  <Input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.department")}</Label>
                  <Input
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.role")}</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(v) => setFormData({ ...formData, role: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t(`gabinet.employees.roles.${r}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.notesComments")}</Label>
                <RichTextEditor
                  value={formData.notes}
                  onChange={(val) => setFormData({ ...formData, notes: val ?? "" })}
                  minHeight="80px"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
              {readOnlyField(
                t("gabinet.employees.detailedData.employmentType"),
                employee.employmentType
                  ? t(`gabinet.employees.detailedData.employmentTypes.${employee.employmentType}`)
                  : undefined,
              )}
              {readOnlyField(t("gabinet.employees.detailedData.position"), employee.position)}
              {readOnlyField(t("gabinet.employees.hireDate"), employee.hireDate)}
              {readOnlyField(t("gabinet.employees.detailedData.endDate"), employee.endDate)}
              {readOnlyField(t("gabinet.employees.detailedData.department"), employee.department)}
              {readOnlyField(
                t("gabinet.employees.role"),
                t(`gabinet.employees.roles.${employee.role}`),
              )}
              {readOnlyField(
                t("common.status"),
                employee.isActive
                  ? t("gabinet.employees.active")
                  : t("common.inactive"),
              )}
              {employee.notes &&
                readOnlyField(t("gabinet.employees.detailedData.notesComments"), plateJsonToText(employee.notes))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section: Kwalifikacje (Qualifications) */}
      <Card>
        <CardContent className="pt-6">
          {sectionHeader(
            t("gabinet.employees.detailedData.qualifications"),
            "qualifications",
            <Star className="h-4 w-4" />,
          )}
          {editing === "qualifications" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.skills")}</Label>
                  <Input
                    value={formData.skills}
                    onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                    placeholder={t("gabinet.employees.detailedData.skillsPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("gabinet.employees.detailedData.skillsHint")}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.yearsOfExperience")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={formData.yearsOfExperience}
                    onChange={(e) => setFormData({ ...formData, yearsOfExperience: e.target.value })}
                  />
                </div>
              </div>

              {/* Certifications editor */}
              <div className="space-y-2">
                <Label>{t("gabinet.employees.detailedData.certifications")}</Label>
                {certifications.map((cert, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-md border p-2">
                    <span className="flex-1 text-sm">{cert.name}</span>
                    {cert.dateObtained && (
                      <span className="text-xs text-muted-foreground">{cert.dateObtained}</span>
                    )}
                    {cert.expiryDate && (
                      <span className="text-xs text-muted-foreground">
                        → {cert.expiryDate}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() => handleRemoveCertification(idx)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Input
                      placeholder={t("gabinet.employees.detailedData.certNamePlaceholder")}
                      value={newCertName}
                      onChange={(e) => setNewCertName(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <Input
                    type="date"
                    value={newCertDate}
                    onChange={(e) => setNewCertDate(e.target.value)}
                    className="h-8 w-36"
                  />
                  <Input
                    type="date"
                    value={newCertExpiry}
                    onChange={(e) => setNewCertExpiry(e.target.value)}
                    className="h-8 w-36"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={handleAddCertification}
                    disabled={!newCertName.trim()}
                  >
                    <Plus className="h-3 w-3" variant="stroke" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Skills */}
              {employee.skills && employee.skills.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t("gabinet.employees.detailedData.skills")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {employee.skills.map((skill, idx) => (
                      <Badge key={idx} variant="secondary">{skill}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {readOnlyField(
                t("gabinet.employees.detailedData.yearsOfExperience"),
                employee.yearsOfExperience != null ? String(employee.yearsOfExperience) : undefined,
              )}
              {/* Certifications list */}
              {employee.certifications && employee.certifications.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t("gabinet.employees.detailedData.certifications")}
                  </p>
                  <div className="space-y-1">
                    {employee.certifications.map((cert, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{cert.name}</span>
                        {cert.dateObtained && (
                          <span className="text-xs text-muted-foreground">{cert.dateObtained}</span>
                        )}
                        {cert.expiryDate && (
                          <span className="text-xs text-muted-foreground">
                            → {cert.expiryDate}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(!employee.skills || employee.skills.length === 0) &&
                !employee.yearsOfExperience &&
                (!employee.certifications || employee.certifications.length === 0) && (
                  <p className="text-sm text-muted-foreground">
                    {t("gabinet.employees.detailedData.noQualificationsYet")}
                  </p>
                )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section: Przypisane zabiegi (Assigned Treatments) */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-primary">
              <ClipboardList className="h-4 w-4" />
            </span>
            <h4 className="text-base font-semibold">
              {t("gabinet.employees.detailedData.assignedTreatments")}
            </h4>
          </div>
          {employee.qualifiedTreatmentIds.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {employee.qualifiedTreatmentIds.map((tid) => (
                <Badge key={tid} variant="secondary" className="gap-1 pr-1">
                  {treatmentMap.get(tid) || "..."}
                  <button
                    type="button"
                    className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                    onClick={() => handleRemoveTreatmentLocal(tid)}
                  >
                    <X className="h-[18px] w-[18px]" variant="stroke" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-3">
              {t("gabinet.employees.noQualifications")}
            </p>
          )}
          <div className="relative max-w-sm">
            <div className="flex items-center w-full rounded-md border bg-transparent">
              <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" variant="stroke" />
              <input
                type="text"
                className="h-8 w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
                placeholder={t("gabinet.employees.addTreatment")}
                value={treatmentSearchLocal}
                onChange={(e) => setTreatmentSearchLocal(e.target.value)}
              />
            </div>
            {treatmentSearchLocal.length > 0 && availableTreatmentsLocal.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
                <ul className="max-h-[200px] overflow-y-auto p-1">
                  {availableTreatmentsLocal.map((tr) => (
                    <li key={tr._id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                        onClick={() => handleAddTreatmentLocal(tr._id)}
                      >
                        {tr.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {treatmentSearchLocal.length > 0 && availableTreatmentsLocal.length === 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
                <div className="py-3 px-3 text-sm text-muted-foreground">
                  {t("detail.relationships.noResults")}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section: Wynagrodzenie (Compensation) */}
      <Card>
        <CardContent className="pt-6">
          {sectionHeader(
            t("gabinet.employees.detailedData.compensation"),
            "compensation",
            <DollarSign className="h-4 w-4" />,
          )}
          {editing === "compensation" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.baseSalary")}</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.01}
                    value={formData.baseSalary}
                    onChange={(e) => setFormData({ ...formData, baseSalary: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.commissionPercent")}</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={0.1}
                    value={formData.commissionPercent}
                    onChange={(e) => setFormData({ ...formData, commissionPercent: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.bankAccount")}</Label>
                <Input
                  value={formData.bankAccount}
                  onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                  placeholder="PL00 0000 0000 0000 0000 0000 0000"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
              {readOnlyField(
                t("gabinet.employees.detailedData.baseSalary"),
                employee.baseSalary != null
                  ? `${employee.baseSalary.toLocaleString(i18nLanguage)} PLN`
                  : undefined,
              )}
              {readOnlyField(
                t("gabinet.employees.detailedData.commissionPercent"),
                employee.commissionPercent != null ? `${employee.commissionPercent}%` : undefined,
              )}
              {readOnlyField(t("gabinet.employees.detailedData.bankAccount"), employee.bankAccount)}
              {!employee.baseSalary && !employee.commissionPercent && !employee.bankAccount && (
                <p className="text-sm text-muted-foreground col-span-2">
                  {t("gabinet.employees.detailedData.noCompensationYet")}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Assigned items (materials issued to employee: keys, uniform, access card, etc.) ---

type AssignedItem = NonNullable<MappedGabinetEmployee["assignedItems"]>[number];

function AssignedItemsTab({
  employee,
  organizationId,
  onUpdate,
  t,
}: {
  employee: MappedGabinetEmployee;
  organizationId: Id<"organizations">;
  onUpdate: (args: FunctionArgs<typeof api.gabinet.employees.update>) => Promise<void>;
  t: TFunction;
}) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [newIssuedDate, setNewIssuedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [newNotes, setNewNotes] = useState("");

  const items = employee.assignedItems ?? [];
  const activeItems = items.filter((it) => !it.returnedDate);
  const returnedItems = items.filter((it) => !!it.returnedDate);

  const persist = async (next: AssignedItem[]) => {
    setSaving(true);
    try {
      await onUpdate({
        organizationId,
        employeeId: employee._id,
        assignedItems: next.length > 0 ? next : null,
      });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.employees.errors.saveFailed",
          defaultValue: "Nie udało się zapisać zmian pracownika.",
        }),
      );
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const qty = Number(newQuantity);
    const item: AssignedItem = {
      name: newName.trim(),
      quantity: Number.isFinite(qty) && qty > 0 ? qty : undefined,
      issuedDate: newIssuedDate || undefined,
      notes: newNotes.trim() || undefined,
    };
    try {
      await persist([...items, item]);
      setNewName("");
      setNewQuantity("1");
      setNewIssuedDate(new Date().toISOString().split("T")[0]);
      setNewNotes("");
      setAdding(false);
      toast.success(t("common.saved"));
    } catch {
      // toast handled in persist
    }
  };

  const handleMarkReturned = async (index: number) => {
    const next = items.map((it, i) =>
      i === index
        ? { ...it, returnedDate: new Date().toISOString().split("T")[0] }
        : it,
    );
    try {
      await persist(next);
      toast.success(t("common.saved"));
    } catch {
      // toast handled in persist
    }
  };

  const handleUnmarkReturned = async (index: number) => {
    const next = items.map((it, i) =>
      i === index ? { ...it, returnedDate: undefined } : it,
    );
    try {
      await persist(next);
      toast.success(t("common.saved"));
    } catch {
      // toast handled in persist
    }
  };

  const handleRemove = async (index: number) => {
    const next = items.filter((_, i) => i !== index);
    try {
      await persist(next);
      toast.success(t("common.saved"));
    } catch {
      // toast handled in persist
    }
  };

  const renderItemRow = (item: AssignedItem, index: number, isReturned: boolean) => (
    <div
      key={index}
      className="flex flex-wrap items-start gap-3 rounded-md border p-3"
    >
      <Briefcase className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{item.name}</span>
          {item.quantity && item.quantity > 1 && (
            <Badge variant="secondary" className="text-xs">
              ×{item.quantity}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {item.issuedDate && (
            <span>
              {t("gabinet.employees.assignedItems.issued")}: {item.issuedDate}
            </span>
          )}
          {item.returnedDate && (
            <span>
              {t("gabinet.employees.assignedItems.returned")}: {item.returnedDate}
            </span>
          )}
        </div>
        {item.notes && (
          <p className="text-xs text-muted-foreground">{item.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-1">
        {isReturned ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleUnmarkReturned(index)}
            disabled={saving}
          >
            {t("gabinet.employees.assignedItems.markActive")}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleMarkReturned(index)}
            disabled={saving}
          >
            {t("gabinet.employees.assignedItems.markReturned")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-destructive"
          onClick={() => handleRemove(index)}
          disabled={saving}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">
            {t("gabinet.employees.assignedItems.heldTitle")}
            {activeItems.length > 0 && (
              <span className="ml-2 text-sm text-muted-foreground">
                ({activeItems.length})
              </span>
            )}
          </CardTitle>
          {!adding && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" variant="stroke" />
              {t("gabinet.employees.assignedItems.add")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {adding && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_160px]">
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("gabinet.employees.assignedItems.itemName")}
                  </Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={t("gabinet.employees.assignedItems.itemNamePlaceholder")}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("gabinet.employees.assignedItems.quantity")}
                  </Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("gabinet.employees.assignedItems.issuedDate")}
                  </Label>
                  <Input
                    type="date"
                    value={newIssuedDate}
                    onChange={(e) => setNewIssuedDate(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  {t("gabinet.employees.assignedItems.notes")}
                </Label>
                <Input
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder={t("gabinet.employees.assignedItems.notesPlaceholder")}
                  className="h-9"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAdding(false);
                    setNewName("");
                    setNewQuantity("1");
                    setNewIssuedDate(new Date().toISOString().split("T")[0]);
                    setNewNotes("");
                  }}
                  disabled={saving}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={!newName.trim() || saving}
                >
                  {t("common.save")}
                </Button>
              </div>
            </div>
          )}
          {activeItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("gabinet.employees.assignedItems.empty")}
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((item, index) =>
                item.returnedDate ? null : renderItemRow(item, index, false),
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {returnedItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-muted-foreground">
              {t("gabinet.employees.assignedItems.returnedTitle")}
              <span className="ml-2 text-sm">({returnedItems.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {items.map((item, index) =>
                item.returnedDate ? renderItemRow(item, index, true) : null,
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// --- Per-employee permissions tab ---

type Scope = "none" | "own" | "all";
type LocalPerms = Partial<Record<string, Partial<Record<string, Scope>>>>;

const EMPLOYEE_PERMISSION_FEATURES = [
  { key: "gabinet_dashboard", labelKey: "gabinet.roles.features.dashboard", actions: ["view"] as const },
  { key: "gabinet_patients", labelKey: "gabinet.roles.features.patients", actions: ["view", "create", "edit", "delete"] as const },
  { key: "gabinet_appointments", labelKey: "gabinet.roles.features.appointments", actions: ["view", "create", "edit", "delete"] as const },
  { key: "gabinet_treatments", labelKey: "gabinet.roles.features.treatments", actions: ["view", "create", "edit", "delete"] as const },
  { key: "gabinet_packages", labelKey: "gabinet.roles.features.packages", actions: ["view", "create", "edit", "delete"] as const },
  { key: "gabinet_employees", labelKey: "gabinet.roles.features.employees", actions: ["view", "create", "edit", "delete"] as const },
  { key: "gabinet_payments", labelKey: "gabinet.roles.features.payments", actions: ["view", "create", "edit", "delete", "refund"] as const },
  { key: "gabinet_reports", labelKey: "gabinet.roles.features.reports", actions: ["view"] as const },
  { key: "gabinet_financial_reports", labelKey: "gabinet.roles.features.financial_reports", actions: ["view"] as const },
  { key: "gabinet_purchase_prices", labelKey: "gabinet.roles.features.purchase_prices", actions: ["view", "create", "edit"] as const },
  { key: "gabinet_photos", labelKey: "gabinet.roles.features.photos", actions: ["view", "create", "edit", "delete"] as const },
  { key: "gabinet_online_booking", labelKey: "gabinet.roles.features.online_booking", actions: ["view", "create", "edit", "delete"] as const },
  { key: "gabinet_inventory", labelKey: "gabinet.roles.features.inventory", actions: ["view", "create", "edit", "delete"] as const },
  { key: "gabinet_settings", labelKey: "gabinet.roles.features.settings", actions: ["view", "create", "edit", "delete"] as const },
] as const;

const ALL_PERMS_FEATURES = [
  "leads", "contacts", "companies", "documents", "activities", "calls", "email",
  "products", "pipelines", "gabinet_dashboard", "gabinet_patients", "gabinet_appointments",
  "gabinet_treatments", "gabinet_packages", "gabinet_employees", "gabinet_payments",
  "gabinet_reports", "gabinet_financial_reports", "gabinet_purchase_prices", "gabinet_photos",
  "gabinet_online_booking", "gabinet_inventory", "gabinet_settings", "settings", "team",
  "document_templates", "document_instances", "tagDefinitions", "categoryDefinitions",
] as const;

const ALL_PERMS_ACTIONS = ["view", "create", "edit", "delete", "approve", "sign", "refund"] as const;

function buildEmpLocalPerms(
  raw: Record<string, Record<string, string>> | null,
  roleDefaults?: Record<string, Record<string, string>> | null,
): LocalPerms {
  const result: LocalPerms = {};
  for (const f of EMPLOYEE_PERMISSION_FEATURES) {
    result[f.key] = {};
    for (const action of f.actions) {
      // When no override row exists yet, pre-populate from the role-level defaults
      // so the admin sees the current effective values rather than all-none.
      const fallback = raw === null
        ? ((roleDefaults?.[f.key]?.[action] as Scope) ?? "none")
        : "none";
      result[f.key]![action] = (raw?.[f.key]?.[action] as Scope) ?? fallback;
    }
  }
  return result;
}

function buildEmpFullPermissions(local: LocalPerms): Record<string, Record<string, string>> {
  const none: Record<string, string> = {};
  for (const action of ALL_PERMS_ACTIONS) none[action] = "none";
  const result: Record<string, Record<string, string>> = {};
  for (const f of ALL_PERMS_FEATURES) {
    result[f] = { ...none };
  }
  for (const f of EMPLOYEE_PERMISSION_FEATURES) {
    for (const action of f.actions) {
      result[f.key][action] = local[f.key]?.[action] ?? "none";
    }
  }
  return result;
}

function EmpScopeSelect({ value, onChange }: { value: Scope; onChange: (v: Scope) => void }) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Scope)}>
      <SelectTrigger className="h-7 w-24 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t("permissions.levels.none", "Brak")}</SelectItem>
        <SelectItem value="own">{t("permissions.levels.own", "Własne")}</SelectItem>
        <SelectItem value="all">{t("permissions.levels.all", "Wszystkie")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function EmployeePermissionsTab({
  organizationId,
  userId,
  gabinetRole,
  t,
}: {
  organizationId: Id<"organizations">;
  userId: Id<"users">;
  gabinetRole: string;
  t: TFunction;
}) {
  const rawPerms = useConvexQuery(api.gabinetRoles.getEmployeePermissions, {
    organizationId,
    userId,
  });

  const rolePerms = useConvexQuery(api.gabinetRoles.getPermissions, {
    organizationId,
    gabinetRole,
  });

  const setEmpPermissions = useMutation(api.gabinetRoles.setEmployeePermissions);
  const resetEmpPermissions = useMutation(api.gabinetRoles.resetEmployeePermissions);

  const [local, setLocal] = useState<LocalPerms>(() => buildEmpLocalPerms(null, null));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (rawPerms !== undefined && rolePerms !== undefined) {
      setLocal(
        buildEmpLocalPerms(
          rawPerms as Record<string, Record<string, string>> | null,
          rolePerms as Record<string, Record<string, string>> | null,
        ),
      );
      setDirty(false);
    }
  }, [rawPerms, rolePerms]);

  const handleChange = useCallback((feature: string, action: string, scope: Scope) => {
    setLocal((prev) => ({
      ...prev,
      [feature]: { ...prev[feature], [action]: scope },
    }));
    setDirty(true);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setEmpPermissions({
        organizationId,
        userId,
        permissions: buildEmpFullPermissions(local),
      });
      setDirty(false);
      toast.success(t("gabinet.employees.permissions.saved", "Uprawnienia zapisane"));
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.employees.permissions.saveError",
          defaultValue: "Nie udało się zapisać uprawnień",
        })
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetEmpPermissions({ organizationId, userId });
      toast.success(t("gabinet.employees.permissions.reset", "Przywrócono uprawnienia roli"));
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.employees.permissions.resetError",
          defaultValue: "Nie udało się zresetować uprawnień",
        })
      );
    } finally {
      setResetting(false);
    }
  };

  if (rawPerms === undefined || rolePerms === undefined) {
    return <div className="py-8 text-center text-sm text-muted-foreground">{t("common.loading", "Ładowanie…")}</div>;
  }

  const hasOverride = rawPerms !== null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t("gabinet.employees.permissions.title", "Uprawnienia pracownika")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t(
              "gabinet.employees.permissions.description",
              "Indywidualne nadpisania uprawnień dla tego pracownika. Zapisane wartości zastępują uprawnienia roli — możliwe jest zarówno podwyższenie jak i ograniczenie dostępu. Brak nadpisania oznacza stosowanie uprawnień roli."
            )}
          </p>
          {hasOverride && (
            <Badge variant="secondary" className="w-fit">
              {t("gabinet.employees.permissions.overrideActive", "Aktywne nadpisanie uprawnień")}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-6 text-left font-medium text-muted-foreground whitespace-nowrap">
                    {t("gabinet.roles.feature", "Funkcja")}
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                    {t("permissions.actions.view", "Widok")}
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                    {t("permissions.actions.create", "Tworzenie")}
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                    {t("permissions.actions.edit", "Edycja")}
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                    {t("permissions.actions.delete", "Usuwanie")}
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                    {t("permissions.actions.refund", "Zwrot")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {EMPLOYEE_PERMISSION_FEATURES.map((feature) => (
                  <tr key={feature.key} className="border-b last:border-0">
                    <td className="py-3 pr-6 font-medium whitespace-nowrap">
                      {t(feature.labelKey, feature.key)}
                    </td>
                    {(["view", "create", "edit", "delete", "refund"] as const).map((action) => {
                      const supported = (feature.actions as readonly string[]).includes(action);
                      const scope = local[feature.key]?.[action] ?? "none";
                      return (
                        <td key={action} className="px-2 py-3">
                          {supported ? (
                            <EmpScopeSelect
                              value={scope}
                              onChange={(v) => handleChange(feature.key, action, v)}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-4 border-t mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={resetting || !hasOverride}
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" variant="stroke" />
              {resetting
                ? t("common.loading", "Ładowanie…")
                : t("gabinet.employees.permissions.resetButton", "Przywróć uprawnienia roli")}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
              {saving ? t("common.saving", "Zapisywanie…") : t("common.save", "Zapisz")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
