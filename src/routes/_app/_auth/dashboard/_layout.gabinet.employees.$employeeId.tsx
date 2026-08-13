import { useState, useMemo, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import {
  useSupabaseGabinetEmployee,
  useSupabaseGabinetEmployeesList,
} from "@/hooks/use-supabase-gabinet-employees";
import { useSupabaseGabinetLocationsList } from "@/hooks/use-supabase-gabinet-locations";
import { useSupabase } from "@/components/supabase-provider";
import { useSupabaseGabinetEmployeeSchedulesList } from "@/hooks/use-supabase-gabinet-employee-schedules";
import { useSupabaseGabinetWorkingHoursList } from "@/hooks/use-supabase-gabinet-working-hours";
import { useSupabaseOrganizationMembers } from "@/hooks/use-supabase-organizations";
import { useSupabaseGabinetTreatmentsList } from "@/hooks/use-supabase-gabinet-treatments";
import { useSupabaseActivityTypesList } from "@/hooks/use-supabase-activity-types";
import { useSupabaseActivitiesByEntity } from "@/hooks/use-supabase-activities";
import { useSupabaseScheduledActivitiesByEntity } from "@/hooks/use-supabase-scheduled-activities";
import { useSupabaseNotesByEntity } from "@/hooks/use-supabase-notes";
import { useSupabaseGabinetAppointmentsByEmployee } from "@/hooks/use-supabase-gabinet-appointments";
import { useSupabasePendingInvitations } from "@/hooks/use-supabase-invitations";
import {
  FlexibleScheduleEditor,
  groupSchedulesIntoPeriods,
} from "@/components/gabinet/flexible-schedule-editor";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  EntityDetailLayout,
  type DetailField,
} from "@/components/crm/entity-detail-layout";
import { EntityDocumentsTab } from "@/components/documents/entity-documents-tab";
import { ActivityDetailDrawer } from "@/components/crm/activity-detail-drawer";
import { ActivityFeed } from "@/components/crm/activity-feed";
import { activitiesToFeedEntries } from "@/components/crm/activity-feed-adapter";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";
import { PermissionGate, useRole } from "@/hooks/use-permission";
import { EmployeeNavGroups } from "@/components/gabinet/employees/employee-nav-groups";
import { AppointmentsTabContent } from "@/components/gabinet/employees/appointments-tab-content";
import { PatientsTabContent } from "@/components/gabinet/employees/patients-tab-content";
import { NotesTabContent } from "@/components/gabinet/employees/notes-tab-content";
import { EditEmployeeDrawer } from "@/components/gabinet/employees/edit-employee-drawer";
import { UpcomingAgenda } from "@/components/gabinet/employees/upcoming-agenda";
import { DetailedDataTab } from "@/components/gabinet/employees/detailed-data-tab";
import { AssignedItemsTab } from "@/components/gabinet/employees/assigned-items-tab";
import { EmployeePermissionsTab } from "@/components/gabinet/employees/employee-permissions-tab";
import { AccountTabContent } from "@/components/gabinet/employees/account-tab-content";

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
  const createNote = useAction(api.crm.notes.create);
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
  const resendInvitation = useAction(api.invitations.resend);

  // Supabase cache invalidation helpers
  const invalidateEmployeeCache = () => {
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetEmployees.list(organizationId) });
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetEmployees.detail(organizationId, employeeId) });
    void queryClient.invalidateQueries({
      queryKey: supabaseKeys.gabinetEmployeeLocations.detail(organizationId, employeeId),
    });
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
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Main navigation groups: controls which sub-tabs are visible
  const [activeNavGroup, setActiveNavGroup] = useState<string>("clientsAndVisits");
  const [activeTab, setActiveTab] = useState<string>(t("gabinet.employees.tabs.terminarz"));

  const handleNavGroupChange = (group: string) => {
    setActiveNavGroup(group);
    if (group === "clientsAndVisits") {
      setActiveTab(t("gabinet.employees.tabs.terminarz"));
    } else if (group === "schedule") {
      setActiveTab(t("gabinet.employees.tabs.grafikPracy"));
    } else if (group === "employeeData") {
      setActiveTab(t("gabinet.employees.tabs.dataAndEmployment"));
    } else if (group === "documentsAndAssets") {
      setActiveTab(t("gabinet.employees.tabs.documents", "Dokumenty"));
    } else if (group === "accountAndAccess") {
      setActiveTab(t("gabinet.employees.tabs.account", "Konto"));
    } else {
      setActiveTab("");
    }
  };

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

  const { client: supabaseClient, isReady: supabaseReady } = useSupabase();
  const { data: primaryLocationData } = useQuery({
    queryKey: supabaseKeys.gabinetEmployeeLocations.detail(organizationId, employeeId),
    queryFn: async () => {
      if (!supabaseClient) return null;
      const { data } = await supabaseClient
        .from("gabinet_employee_locations")
        .select("location_id, role")
        .eq("organization_id", String(organizationId))
        .eq("employee_id", employeeId)
        .eq("is_primary", true)
        .maybeSingle();
      if (!data) return null;
      return { locationId: data.location_id as string | null, locationRole: data.role as string | null };
    },
    enabled: supabaseReady && !!supabaseClient && !!employeeId,
  });
  const { data: locations } = useSupabaseGabinetLocationsList(String(organizationId));

  const { data: members } = useSupabaseOrganizationMembers(organizationId);
  const { data: pendingInvitations } = useSupabasePendingInvitations(organizationId);

  const { data: allEmployees } = useSupabaseGabinetEmployeesList(organizationId);

  const { data: treatments } = useSupabaseGabinetTreatmentsList(organizationId);

  const { data: activityTypeDefs } = useSupabaseActivityTypesList(organizationId);

  const { data: activities } = useSupabaseActivitiesByEntity(
    organizationId,
    "gabinetEmployee",
    employeeId,
  );

  const { data: scheduleActivities } = useSupabaseActivitiesByEntity(
    organizationId,
    "gabinetEmployeeSchedule",
    employee?.userId ?? undefined,
    { enabled: !!employee?.userId },
  );

  const { data: leaveActivities } = useSupabaseActivitiesByEntity(
    organizationId,
    "gabinetLeave",
    employee?.userId ?? undefined,
    { enabled: !!employee?.userId },
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

  const user = employee?.userId ? userMap.get(employee.userId) : undefined;

  // Match a pending invitation to this employee by email (employee.email or linked user email).
  // Used to show "Zaproszenie wysłane/wygasło" status and the resend action.
  const pendingInvitation = useMemo(() => {
    const email = employee?.email || user?.email;
    if (!email || !pendingInvitations) return null;
    return pendingInvitations.find((inv) => inv.email === email) ?? null;
  }, [pendingInvitations, employee?.email, user?.email]);

  const isExpiredInvitation = pendingInvitation ? pendingInvitation.expiresAt <= Date.now() : false;
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
        employeeId: employeeId,
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetEmployees.list(organizationId) });
      navigate({ to: "/dashboard/gabinet/employees" });
    }
  };

  const handleActivate = async () => {
    if (!window.confirm(t("gabinet.employees.confirmActivate", "Czy na pewno chcesz aktywować konto tego pracownika?"))) return;
    try {
      await updateEmployee({ organizationId, employeeId, isActive: true });
      toast.success(t("gabinet.employees.activated", "Konto aktywowane."));
      invalidateEmployeeCache();
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.employees.errors.activateFailed",
          defaultValue: "Nie udało się aktywować konta.",
        }),
      );
    }
  };

  const handleResendInvitation = async () => {
    if (!pendingInvitation) return;
    try {
      await resendInvitation({ organizationId, invitationId: pendingInvitation._id });
      toast.success(t("team.invitationResent", "Zaproszenie zostało wysłane ponownie."));
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.invitations.list(organizationId) });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "team.errors.resendFailed",
          defaultValue: "Nie udało się wysłać zaproszenia ponownie.",
        }),
      );
    }
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
      activityId: data.activityId,
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
      activityId: activityId,
    });
    setActivityDrawerOpen(false);
    setSelectedActivityId(null);
  };

  const handleToggleActivityComplete = async (activityId: string, isCompleted: boolean) => {
    if (isCompleted) {
      await markActivityComplete({ organizationId, activityId: activityId });
    } else {
      await markActivityIncomplete({ organizationId, activityId: activityId });
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
  const primaryLocationName = primaryLocationData?.locationId
    ? (locations?.find((l) => l._id === primaryLocationData.locationId)?.name ?? primaryLocationData.locationId)
    : undefined;

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
        {
          label: t("gabinet.employees.location", { defaultValue: "Lokalizacja" }),
          value: primaryLocationName,
          fieldKey: "location",
        },
        ...(primaryLocationData?.locationRole
          ? [{
              label: t("settings.team.gabinetLocationRole"),
              value: t(`gabinet.employees.roles.${primaryLocationData.locationRole}`),
              fieldKey: "locationRole",
            }]
          : []),
      ]
    : [];

  const sidebarExtra = undefined;

  // Header subtitle with color swatch, role badge, and account/invitation status badge
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
      {pendingInvitation ? (
        <Badge variant="outline" className="text-muted-foreground">
          {isExpiredInvitation
            ? t("gabinet.employees.statusInvitationExpired", "Zaproszenie wygasło")
            : t("gabinet.employees.statusInvitationPending", "Zaproszenie wysłane — oczekuje na akceptację")}
        </Badge>
      ) : !employee.isActive ? (
        <Badge variant="outline" className="text-muted-foreground">
          {employee.userId
            ? t("gabinet.employees.statusBlocked", "Konto zablokowane")
            : t("gabinet.employees.statusInactive", "Konto nieaktywne")}
        </Badge>
      ) : null}
    </div>
  );

  const mergedEmployeeActivities = [
    ...(activities ?? []),
    ...(scheduleActivities ?? []),
    ...(leaveActivities ?? []),
  ].sort((a, b) => b.createdAt - a.createdAt);

  // Tabs definition
  const tabs = !employee ? [] : [
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
      label: t("gabinet.employees.tabs.dataAndEmployment"),
      content: (
        <DetailedDataTab
          employee={employee}
          userEmail={user?.email}
          treatments={treatments}
          treatmentMap={treatmentMap}
          organizationId={organizationId}
          role={role}
          onUpdate={async (a) => { await updateEmployee(a); invalidateEmployeeCache(); }}
          onSetTreatments={async (a) => { await setQualifiedTreatments(a); invalidateEmployeeCache(); }}
          t={t}
          i18nLanguage={i18n.language}
          limitedView={true}
        />
      ),
    },
    ...(employee.performsServices ? [{
      label: t("gabinet.employees.tabs.qualificationsAndTreatments"),
      content: (
        <DetailedDataTab
          employee={employee}
          userEmail={user?.email}
          treatments={treatments}
          treatmentMap={treatmentMap}
          organizationId={organizationId}
          role={role}
          onUpdate={async (a) => { await updateEmployee(a); invalidateEmployeeCache(); }}
          onSetTreatments={async (a) => { await setQualifiedTreatments(a); invalidateEmployeeCache(); }}
          t={t}
          i18nLanguage={i18n.language}
          qualificationsOnlyView={true}
        />
      ),
    }] : []),
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
          onUpdate={async (a) => { await updateEmployee(a); invalidateEmployeeCache(); }}
          onSetTreatments={async (a) => { await setQualifiedTreatments(a); invalidateEmployeeCache(); }}
          t={t}
          i18nLanguage={i18n.language}
        />
      ),
    },
    {
      label: t("gabinet.employees.tabs.grafikPracy"),
      content: employee.userId ? (
        <FlexibleScheduleEditor
          organizationId={organizationId}
          userId={employee.userId}
          periods={schedulePeriods}
          clinicHours={clinicHours ?? []}
          onSavePeriod={async (a) => { await saveSchedulePeriod(a); invalidateScheduleCache(); }}
          onRemovePeriod={async (a) => { await removeSchedulePeriod(a); invalidateScheduleCache(); }}
          onSaveLegacy={async (a) => { await bulkSetEmployeeSchedule(a); invalidateScheduleCache(); }}
          onManageLeaves={() => navigate({ to: "/dashboard/gabinet/settings/leaves" })}
        />
      ) : (
        <p className="text-muted-foreground text-sm">{t("gabinet.employees.noUserAccount", "Pracownik nie ma powiązanego konta użytkownika.")}</p>
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
      label: t("gabinet.employees.tabs.account", "Konto"),
      content: (
        <AccountTabContent
          employee={employee}
          userEmail={user?.email}
          onChangePassword={async (newPassword) => {
            await changeEmployeePassword({ organizationId, employeeId, newPassword });
          }}
          onEditEmployee={() => setEditDrawerOpen(true)}
          onDeactivate={handleDeactivate}
          onActivate={handleActivate}
          pendingInvitation={pendingInvitation}
          onResendInvitation={isExpiredInvitation ? handleResendInvitation : undefined}
          t={t}
        />
      ),
    },
    {
      label: t("gabinet.employees.activity"),
      content: (
        <ActivityFeed
          entries={activitiesToFeedEntries(mergedEmployeeActivities, t)}
          maxHeight="600px"
        />
      ),
    },
    ...(role === "admin" || role === "owner"
      ? [
          {
            label: t("gabinet.employees.tabs.permissions", "Uprawnienia"),
            content: employee.userId ? (
              <EmployeePermissionsTab
                organizationId={organizationId}
                userId={employee.userId}
                gabinetRole={employee.role}
                t={t}
              />
            ) : (
              <p className="text-muted-foreground text-sm">{t("gabinet.employees.noUserAccount", "Pracownik nie ma powiązanego konta użytkownika.")}</p>
            ),
          },
        ]
      : []),
  ];

  const visibleTabs = (() => {
    switch (activeNavGroup) {
      case "clientsAndVisits":
        return tabs.slice(0, 3);
      case "schedule":
        return tabs.filter(tab => tab.label === t("gabinet.employees.tabs.grafikPracy"));
      case "employeeData":
        return tabs.filter(
          tab =>
            tab.label === t("gabinet.employees.tabs.dataAndEmployment") ||
            tab.label === t("gabinet.employees.tabs.qualificationsAndTreatments") ||
            tab.label === t("gabinet.employees.tabs.notes")
        );
      case "documentsAndAssets":
        return tabs.filter(
          tab =>
            tab.label === t("gabinet.employees.tabs.documents", "Dokumenty") ||
            tab.label === t("gabinet.employees.tabs.assignedItems")
        );
      case "accountAndAccess":
        return tabs.filter(
          tab =>
            tab.label === t("gabinet.employees.tabs.account", "Konto") ||
            tab.label === t("gabinet.employees.activity") ||
            tab.label === t("gabinet.employees.tabs.permissions", "Uprawnienia")
        );
      default:
        return [];
    }
  })();

  return (
    <>
      <EntityDetailLayout
        variant="default"
        isLoading={isLoading}
        notFound={!employee && !isLoading}
        onBack={() => navigate({ to: "/dashboard/gabinet/employees" })}
        title={fullName}
        headerSubtitle={headerSubtitle}
        avatarUrl={employee?.avatarUrl ?? undefined}
        avatarFallback={avatarFallback}
        fields={detailFields}
        expandedFieldCount={5}
        sidebarExtra={sidebarExtra}
        tabs={visibleTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        initialSidebarWidth={300}
        beforeTabs={
          <EmployeeNavGroups
            activeGroup={activeNavGroup}
            onGroupChange={handleNavGroupChange}
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

    </>
  );
}
