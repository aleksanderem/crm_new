import { useState, useMemo, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import {
  EntityDetailLayout,
  type DetailField,
} from "@/components/crm/entity-detail-layout";
import { EntityDocumentsTab } from "@/components/documents/entity-documents-tab";
import { SidePanel } from "@/components/crm/side-panel";
import { ActivityDetailDrawer } from "@/components/crm/activity-detail-drawer";
import { ActivityTimeline } from "@/components/activity-timeline/activity-timeline";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RichTextEditor, plateJsonToText } from "@/components/gabinet/rich-text-editor";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Search,
  X,
  Calendar,
  ClipboardList,
  Clock,
  User,
  Plus,
  Trash2,
  Briefcase,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  Star,
  FileText,
} from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/employees/$employeeId"
)({
  component: EmployeeDetail,
});

const ROLES = ["doctor", "nurse", "therapist", "receptionist", "admin", "other"] as const;

function EmployeeDetail() {
  const { employeeId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  // Mutations
  const updateEmployee = useMutation(api.gabinet.employees.update);
  const removeEmployee = useMutation(api.gabinet.employees.remove);
  const setQualifiedTreatments = useMutation(api.gabinet.employees.setQualifiedTreatments);
  const createNote = useMutation(api.notes.create);
  const markActivityComplete = useMutation(api.scheduledActivities.markComplete);
  const markActivityIncomplete = useMutation(api.scheduledActivities.markIncomplete);
  const updateScheduledActivity = useMutation(api.scheduledActivities.update);
  const removeScheduledActivity = useMutation(api.scheduledActivities.remove);
  const bulkSetEmployeeSchedule = useMutation(api.gabinet.scheduling.bulkSetEmployeeSchedule);
  const saveSchedulePeriod = useMutation(api.gabinet.scheduling.saveSchedulePeriod);
  const removeSchedulePeriod = useMutation(api.gabinet.scheduling.removeSchedulePeriod);
  const trackView = useMutation(api.recentlyViewed.track);

  // UI state
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [treatmentSearch, setTreatmentSearch] = useState("");
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);

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

  // Queries
  const { data: employee, isLoading } = useQuery(
    convexQuery(api.gabinet.employees.getById, {
      organizationId,
      employeeId: employeeId as Id<"gabinetEmployees">,
    })
  );

  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );

  const { data: treatments } = useQuery(
    convexQuery(api.gabinet.treatments.listActive, { organizationId })
  );

  const { data: activityTypeDefs } = useQuery(
    convexQuery(api.activityTypes.list, { organizationId })
  );

  const { data: activitiesData } = useQuery(
    convexQuery(api.activities.getForEntity, {
      organizationId,
      entityType: "gabinetEmployee",
      entityId: employeeId,
      paginationOpts: { numItems: 50, cursor: null },
    })
  );
  const activities = activitiesData?.page;

  const { data: scheduledActivitiesData } = useQuery(
    convexQuery(api.scheduledActivities.listByEntity, {
      organizationId,
      linkedEntityType: "gabinetEmployee",
      linkedEntityId: employeeId,
    })
  );

  const { data: notesData } = useQuery(
    convexQuery(api.notes.listByEntity, {
      organizationId,
      entityType: "gabinetEmployee",
      entityId: employeeId,
    })
  );

  // Appointments for this employee (by userId)
  const { data: employeeAppointments } = useQuery({
    ...convexQuery(api.gabinet.appointments.listByEmployee, {
      organizationId,
      employeeId: (employee?.userId ?? "") as Id<"users">,
    }),
    enabled: !!employee,
  });

  // Unique patients this employee has seen (with visit stats for filtering)
  const { data: employeePatients } = useQuery({
    ...convexQuery(api.gabinet.appointments.listPatientsWithStatsForEmployee, {
      organizationId,
      employeeId: (employee?.userId ?? "") as Id<"users">,
    }),
    enabled: !!employee,
  });

  // Employee schedule (per-employee working hours)
  const { data: employeeScheduleData } = useQuery({
    ...convexQuery(api.gabinet.scheduling.getEmployeeSchedule, {
      organizationId,
      userId: (employee?.userId ?? "") as Id<"users">,
    }),
    enabled: !!employee,
  });

  // Clinic-wide working hours (fallback)
  const { data: clinicHours } = useQuery(
    convexQuery(api.gabinet.scheduling.getWorkingHours, { organizationId })
  );

  // Selected activity for drawer
  const selectedActivity = scheduledActivitiesData?.find(
    (a) => a._id === selectedActivityId
  ) ?? null;

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
      result = result.filter((p) => (p.statuses as string[]).includes(clientStatusFilter));
    }
    // Treatment filter
    if (clientTreatmentFilter !== "all") {
      result = result.filter((p) => (p.treatmentIds as string[]).includes(clientTreatmentFilter));
    }
    return result;
  }, [employeePatients, clientSearch, clientStatusFilter, clientTreatmentFilter]);

  // Feature 3: Group schedule entries into periods by effectiveFrom
  const schedulePeriods = useMemo(() => {
    if (!employeeScheduleData) return [];
    const periodMap = new Map<string, typeof employeeScheduleData>();
    for (const entry of employeeScheduleData) {
      const key = entry.effectiveFrom ?? "";
      if (!periodMap.has(key)) periodMap.set(key, []);
      periodMap.get(key)!.push(entry);
    }
    return [...periodMap.entries()]
      .map(([from, entries]) => ({
        effectiveFrom: from || undefined,
        effectiveTo: entries[0]?.effectiveTo ?? undefined,
        entries: entries.sort((a, b) => a.dayOfWeek - b.dayOfWeek),
      }))
      .sort((a, b) => (a.effectiveFrom ?? "").localeCompare(b.effectiveFrom ?? ""));
  }, [employeeScheduleData]);

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
      navigate({ to: "/dashboard/gabinet/employees" });
    }
  };

  const handleAddTreatment = async (treatmentId: string) => {
    if (!employee) return;
    const updated = [...employee.qualifiedTreatmentIds, treatmentId as Id<"gabinetTreatments">];
    await setQualifiedTreatments({
      organizationId,
      employeeId: employeeId as Id<"gabinetEmployees">,
      treatmentIds: updated,
    });
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
            <CardTitle className="text-base">{t("gabinet.employees.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {employee.notes}
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
          onUpdate={updateEmployee}
          onSetTreatments={setQualifiedTreatments}
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
          onSavePeriod={saveSchedulePeriod}
          onRemovePeriod={removeSchedulePeriod}
          onSaveLegacy={bulkSetEmployeeSchedule}
        />
      ),
    },
    {
      label: t("gabinet.employees.tabs.documents", "Dokumenty"),
      content: (
        <EntityDocumentsTab
          entityType="employee"
          entityId={employeeId}
          organizationId={organizationId}
        />
      ),
    },
    {
      label: t("gabinet.employees.notes"),
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
        <ActivityTimeline
          activities={activities ?? []}
          maxHeight="600px"
        />
      ),
    },
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
        onEdit={() => setEditDrawerOpen(true)}
        fields={detailFields}
        expandedFieldCount={5}
        sidebarExtra={sidebarExtra}
        tabs={tabs}
        defaultTab={t("gabinet.employees.tabs.agenda")}
      />

      {/* Edit employee drawer */}
      {employee && (
        <EditEmployeeDrawer
          open={editDrawerOpen}
          onOpenChange={setEditDrawerOpen}
          employee={employee}
          organizationId={organizationId}
          onUpdate={updateEmployee}
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
  employeeAppointments: Array<{
    _id: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    treatmentId: string;
  }> | undefined;
  calendarWeekStart: string;
  setCalendarWeekStart: (v: string) => void;
  calendarWeekDates: string[];
  calendarAppointments: Array<{
    _id: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    treatmentId: string;
  }>;
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
                      const tName = treatmentMap.get(apt.treatmentId);
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
              const treatmentName = treatmentMap.get(apt.treatmentId);
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
                    variant={
                      apt.status === "completed"
                        ? "default"
                        : apt.status === "cancelled" || apt.status === "no_show"
                          ? "destructive"
                          : "secondary"
                    }
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
  employeePatients: Array<{
    _id: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    visitCount: number;
    lastVisitDate?: string;
    isActive: boolean;
    statuses: string[];
    treatmentIds: string[];
  }> | undefined;
  filteredClients: Array<{
    _id: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    visitCount: number;
    lastVisitDate?: string;
    isActive: boolean;
  }>;
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
                  {pat.phone && ` · ${pat.phone}`}
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
  onUpdate,
  isSubmitting,
  setIsSubmitting,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: {
    _id: Id<"gabinetEmployees">;
    firstName?: string;
    lastName?: string;
    role: string;
    specialization?: string;
    licenseNumber?: string;
    hireDate?: string;
    color?: string;
    notes?: string;
    isActive: boolean;
  };
  organizationId: Id<"organizations">;
  onUpdate: any;
  isSubmitting: boolean;
  setIsSubmitting: (v: boolean) => void;
  t: any;
}) {
  const [firstName, setFirstName] = useState(employee.firstName ?? "");
  const [lastName, setLastName] = useState(employee.lastName ?? "");
  const [role, setRole] = useState(employee.role);
  const [specialization, setSpecialization] = useState(employee.specialization ?? "");
  const [licenseNumber, setLicenseNumber] = useState(employee.licenseNumber ?? "");
  const [hireDate, setHireDate] = useState(employee.hireDate ?? "");
  const [color, setColor] = useState(employee.color ?? "#3b82f6");
  const [notes, setNotes] = useState(employee.notes ?? "");

  // Re-sync form state when drawer opens
  useEffect(() => {
    if (open) {
      setFirstName(employee.firstName ?? "");
      setLastName(employee.lastName ?? "");
      setRole(employee.role);
      setSpecialization(employee.specialization ?? "");
      setLicenseNumber(employee.licenseNumber ?? "");
      setHireDate(employee.hireDate ?? "");
      setColor(employee.color ?? "#3b82f6");
      setNotes(employee.notes ?? "");
    }
  }, [open, employee]);

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      await onUpdate({
        organizationId,
        employeeId: employee._id,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        role: role as any,
        specialization: specialization || undefined,
        licenseNumber: licenseNumber || undefined,
        hireDate: hireDate || undefined,
        color: color || undefined,
        notes: notes || undefined,
      });
      toast.success(t("common.saved"));
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
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
          <Select value={role} onValueChange={setRole}>
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

// --- Flexible schedule editor with multiple periods ---

const DAY_NAMES_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_PL = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];

interface DaySchedule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isWorking: boolean;
  breakStart: string;
  breakEnd: string;
  locationId: string;
}

interface SchedulePeriod {
  effectiveFrom?: string;
  effectiveTo?: string;
  entries: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isWorking: boolean;
    breakStart?: string;
    breakEnd?: string;
    locationId?: string;
  }>;
}

function FlexibleScheduleEditor({
  organizationId,
  userId,
  periods,
  clinicHours,
  onSavePeriod,
  onRemovePeriod,
  onSaveLegacy,
}: {
  organizationId: Id<"organizations">;
  userId: Id<"users">;
  periods: SchedulePeriod[];
  clinicHours: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isOpen: boolean;
    breakStart?: string;
    breakEnd?: string;
  }>;
  onSavePeriod: any;
  onRemovePeriod: any;
  onSaveLegacy: any;
}) {
  const { t, i18n } = useTranslation();
  const { data: locations } = useQuery(
    convexQuery(api.gabinet.locations.listLocations, { organizationId })
  );
  const [saving, setSaving] = useState(false);
  const [editingPeriodKey, setEditingPeriodKey] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [periodHours, setPeriodHours] = useState<DaySchedule[]>(() => buildDefaultSchedule(clinicHours));

  function buildDefaultSchedule(clinic: typeof clinicHours): DaySchedule[] {
    return Array.from({ length: 7 }, (_, i) => {
      const clinicDay = clinic.find((h) => h.dayOfWeek === i);
      if (clinicDay) {
        return {
          dayOfWeek: i,
          startTime: clinicDay.startTime,
          endTime: clinicDay.endTime,
          isWorking: clinicDay.isOpen,
          breakStart: clinicDay.breakStart ?? "",
          breakEnd: clinicDay.breakEnd ?? "",
          locationId: "",
        };
      }
      return {
        dayOfWeek: i,
        startTime: "08:00",
        endTime: "17:00",
        isWorking: i >= 1 && i <= 5,
        breakStart: "",
        breakEnd: "",
        locationId: "",
      };
    });
  }

  const dayNames = i18n.language === "pl" ? DAY_NAMES_PL : DAY_NAMES_EN;

  const openEditPeriod = (period: SchedulePeriod) => {
    setEditingPeriodKey(period.effectiveFrom ?? "");
    setPeriodFrom(period.effectiveFrom ?? "");
    setPeriodTo(period.effectiveTo ?? "");
    const hours = Array.from({ length: 7 }, (_, i) => {
      const entry = period.entries.find((e) => e.dayOfWeek === i);
      return {
        dayOfWeek: i,
        startTime: entry?.startTime ?? "08:00",
        endTime: entry?.endTime ?? "17:00",
        isWorking: entry?.isWorking ?? (i >= 1 && i <= 5),
        breakStart: entry?.breakStart ?? "",
        breakEnd: entry?.breakEnd ?? "",
        locationId: entry?.locationId ?? "",
      };
    });
    setPeriodHours(hours);
    setAddingNew(false);
  };

  const openNewPeriod = () => {
    setAddingNew(true);
    setEditingPeriodKey(null);
    setPeriodFrom("");
    setPeriodTo("");
    setPeriodHours(buildDefaultSchedule(clinicHours));
  };

  const cancelEdit = () => {
    setEditingPeriodKey(null);
    setAddingNew(false);
  };

  const updateDay = (dayOfWeek: number, field: keyof DaySchedule, value: string | boolean) => {
    setPeriodHours((prev) =>
      prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h))
    );
  };

  const handleSavePeriod = async () => {
    setSaving(true);
    try {
      if (periodFrom || periodTo) {
        // Save as a dated period
        await onSavePeriod({
          organizationId,
          userId,
          effectiveFrom: periodFrom || undefined,
          effectiveTo: periodTo || undefined,
          hours: periodHours.map((h) => ({
            dayOfWeek: h.dayOfWeek,
            startTime: h.startTime,
            endTime: h.endTime,
            isWorking: h.isWorking,
            breakStart: h.breakStart || undefined,
            breakEnd: h.breakEnd || undefined,
            locationId: h.locationId || undefined,
          })),
        });
      } else {
        // Default period: use legacy bulk save (no dates)
        await onSaveLegacy({
          organizationId,
          userId,
          hours: periodHours.map((h) => ({
            dayOfWeek: h.dayOfWeek,
            startTime: h.startTime,
            endTime: h.endTime,
            isWorking: h.isWorking,
            breakStart: h.breakStart || undefined,
            breakEnd: h.breakEnd || undefined,
            locationId: h.locationId || undefined,
          })),
        });
      }
      toast.success(t("common.saved"));
      cancelEdit();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePeriod = async (effectiveFrom?: string) => {
    if (!window.confirm(t("gabinet.employees.schedule.confirmDeletePeriod"))) return;
    try {
      await onRemovePeriod({
        organizationId,
        userId,
        effectiveFrom: effectiveFrom || undefined,
      });
      toast.success(t("common.deleted"));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const isEditing = editingPeriodKey !== null || addingNew;

  // Determine which period is currently active based on today's date
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" variant="stroke" />
            {t("gabinet.employees.tabs.schedule")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {periods.length > 0
              ? t("gabinet.employees.schedule.hasOverrides")
              : t("gabinet.employees.schedule.usingClinicDefaults")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.href = "/dashboard/gabinet/settings/leaves"}
          >
            {t("gabinet.employees.schedule.manageLeaves")}
          </Button>
          {!isEditing && (
            <Button size="sm" onClick={openNewPeriod}>
              <Plus className="mr-1 h-4 w-4" variant="stroke" />
              {t("gabinet.employees.schedule.addPeriod")}
            </Button>
          )}
        </div>
      </div>

      {/* Existing periods list */}
      {!isEditing && periods.length > 0 && (
        <div className="space-y-3">
          {periods.map((period, idx) => {
            const isActive =
              (!period.effectiveFrom || period.effectiveFrom <= today) &&
              (!period.effectiveTo || period.effectiveTo >= today);
            const label = period.effectiveFrom
              ? `${period.effectiveFrom}${period.effectiveTo ? ` — ${period.effectiveTo}` : ` — ${t("gabinet.employees.schedule.ongoing")}`}`
              : t("gabinet.employees.schedule.defaultPeriod");
            return (
              <Card key={period.effectiveFrom ?? `default-${idx}`} className={`p-4 ${isActive ? "border-primary/50" : ""}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{label}</span>
                    {isActive && (
                      <Badge variant="default" className="text-xs">
                        {t("gabinet.employees.schedule.active")}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditPeriod(period)}>
                      <Pencil className="h-3.5 w-3.5" variant="stroke" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDeletePeriod(period.effectiveFrom)}
                    >
                      <Trash2 className="h-3.5 w-3.5" variant="stroke" />
                    </Button>
                  </div>
                </div>
                {/* Compact schedule summary */}
                <div className="grid grid-cols-7 gap-1 text-xs">
                  {Array.from({ length: 7 }, (_, i) => {
                    const entry = period.entries.find((e) => e.dayOfWeek === i);
                    return (
                      <div key={i} className={`text-center p-1 rounded ${entry?.isWorking ? "bg-primary/10" : "bg-muted text-muted-foreground"}`}>
                        <div className="font-medium">{dayNames[i].substring(0, 3)}</div>
                        {entry?.isWorking ? (
                          <div>{entry.startTime}–{entry.endTime}</div>
                        ) : (
                          <div>—</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!isEditing && periods.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Clock className="h-8 w-8 text-muted-foreground/40 mb-2" variant="stroke" />
          <p className="text-sm text-muted-foreground mb-3">
            {t("gabinet.employees.schedule.usingClinicDefaults")}
          </p>
          <Button size="sm" onClick={openNewPeriod}>
            <Plus className="mr-1 h-4 w-4" variant="stroke" />
            {t("gabinet.employees.schedule.addPeriod")}
          </Button>
        </div>
      )}

      {/* Period editor form */}
      {isEditing && (
        <Card className="p-4">
          <div className="space-y-4">
            <h4 className="font-medium">
              {addingNew
                ? t("gabinet.employees.schedule.newPeriod")
                : t("gabinet.employees.schedule.editPeriod")}
            </h4>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.schedule.effectiveFrom")}</Label>
                <Input
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("gabinet.employees.schedule.effectiveFromHint")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.schedule.effectiveTo")}</Label>
                <Input
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("gabinet.employees.schedule.effectiveToHint")}
                </p>
              </div>
            </div>

            {/* Weekly schedule grid */}
            <div className="rounded-lg border">
              <div className="grid grid-cols-[140px_50px_1fr_1fr_1fr_1fr_1fr] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>{t("gabinet.scheduling.day")}</span>
                <span>{t("gabinet.scheduling.open")}</span>
                <span>{t("gabinet.scheduling.start")}</span>
                <span>{t("gabinet.scheduling.end")}</span>
                <span>{t("gabinet.scheduling.breakStart")}</span>
                <span>{t("gabinet.scheduling.breakEnd")}</span>
                <span>{t("gabinet.appointments.location")}</span>
              </div>

              {periodHours.map((h) => (
                <div
                  key={h.dayOfWeek}
                  className="grid grid-cols-[140px_50px_1fr_1fr_1fr_1fr_1fr] items-center gap-2 border-b px-3 py-1.5 last:border-b-0"
                >
                  <span className="text-sm font-medium">{dayNames[h.dayOfWeek]}</span>
                  <Checkbox
                    checked={h.isWorking}
                    onCheckedChange={(checked) => updateDay(h.dayOfWeek, "isWorking", checked as boolean)}
                  />
                  <Input
                    type="time"
                    className="h-7 w-22"
                    value={h.startTime}
                    onChange={(e) => updateDay(h.dayOfWeek, "startTime", e.target.value)}
                    disabled={!h.isWorking}
                  />
                  <Input
                    type="time"
                    className="h-7 w-22"
                    value={h.endTime}
                    onChange={(e) => updateDay(h.dayOfWeek, "endTime", e.target.value)}
                    disabled={!h.isWorking}
                  />
                  <Input
                    type="time"
                    className="h-7 w-22"
                    value={h.breakStart}
                    onChange={(e) => updateDay(h.dayOfWeek, "breakStart", e.target.value)}
                    disabled={!h.isWorking}
                  />
                  <Input
                    type="time"
                    className="h-7 w-22"
                    value={h.breakEnd}
                    onChange={(e) => updateDay(h.dayOfWeek, "breakEnd", e.target.value)}
                    disabled={!h.isWorking}
                  />
                  <Select
                    value={h.locationId || "none"}
                    onValueChange={(val) => updateDay(h.dayOfWeek, "locationId", val === "none" ? "" : val)}
                    disabled={!h.isWorking}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("common.none")}</SelectItem>
                      {locations?.filter((l) => l.isActive).map((l) => (
                        <SelectItem key={l._id} value={l._id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={cancelEdit}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" onClick={handleSavePeriod} disabled={saving}>
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
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
  appointments: Array<{
    _id: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    treatmentId: string;
    patientId: string;
    notes?: string;
  }> | undefined;
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

  const statusColors: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    confirmed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    pending_confirmation: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    in_progress: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    completed: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400",
  };

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
                const treatmentName = treatmentMap.get(apt.treatmentId);
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
                      variant="secondary"
                      className={`text-xs ${statusColors[apt.status] ?? ""}`}
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

function DetailedDataTab({
  employee,
  userEmail,
  treatments,
  treatmentMap,
  organizationId,
  onUpdate,
  onSetTreatments,
  t,
  i18nLanguage,
}: {
  employee: {
    _id: Id<"gabinetEmployees">;
    firstName?: string;
    lastName?: string;
    role: string;
    specialization?: string;
    licenseNumber?: string;
    hireDate?: string;
    color?: string;
    notes?: string;
    isActive: boolean;
    qualifiedTreatmentIds: string[];
    phone?: string;
    email?: string;
    dateOfBirth?: string;
    pesel?: string;
    address?: { street?: string; city?: string; postalCode?: string };
    employmentType?: string;
    endDate?: string;
    position?: string;
    department?: string;
    skills?: string[];
    yearsOfExperience?: number;
    certifications?: Array<{ name: string; dateObtained?: string; expiryDate?: string }>;
    baseSalary?: number;
    commissionPercent?: number;
    bankAccount?: string;
  };
  userEmail?: string | null;
  treatments: Array<{ _id: string; name: string }> | undefined;
  treatmentMap: Map<string, string>;
  organizationId: Id<"organizations">;
  onUpdate: any;
  onSetTreatments: any;
  t: (key: string, opts?: Record<string, unknown>) => string;
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
    dateOfBirth: employee.dateOfBirth ?? "",
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
      dateOfBirth: employee.dateOfBirth ?? "",
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
      dateOfBirth: employee.dateOfBirth ?? "",
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
      const updatePayload: Record<string, unknown> = {
        organizationId,
        employeeId: employee._id,
      };

      if (section === "personal") {
        updatePayload.firstName = formData.firstName || undefined;
        updatePayload.lastName = formData.lastName || undefined;
        updatePayload.phone = formData.phone || undefined;
        updatePayload.email = formData.email || undefined;
        updatePayload.dateOfBirth = formData.dateOfBirth || undefined;
        updatePayload.pesel = formData.pesel || undefined;
        updatePayload.address =
          formData.addressStreet || formData.addressCity || formData.addressPostalCode
            ? {
                street: formData.addressStreet || undefined,
                city: formData.addressCity || undefined,
                postalCode: formData.addressPostalCode || undefined,
              }
            : undefined;
      } else if (section === "employment") {
        updatePayload.employmentType = formData.employmentType || undefined;
        updatePayload.hireDate = formData.hireDate || undefined;
        updatePayload.endDate = formData.endDate || undefined;
        updatePayload.position = formData.position || undefined;
        updatePayload.department = formData.department || undefined;
        updatePayload.role = formData.role as any;
        updatePayload.notes = formData.notes || undefined;
      } else if (section === "qualifications") {
        updatePayload.skills = formData.skills
          ? formData.skills.split(",").map((s: string) => s.trim()).filter(Boolean)
          : undefined;
        updatePayload.yearsOfExperience = formData.yearsOfExperience
          ? Number(formData.yearsOfExperience)
          : undefined;
        updatePayload.certifications =
          certifications.length > 0 ? certifications : undefined;
      } else if (section === "compensation") {
        updatePayload.baseSalary = formData.baseSalary
          ? Number(formData.baseSalary)
          : undefined;
        updatePayload.commissionPercent = formData.commissionPercent
          ? Number(formData.commissionPercent)
          : undefined;
        updatePayload.bankAccount = formData.bankAccount || undefined;
      }

      await onUpdate(updatePayload);
      toast.success(t("common.saved"));
      setEditing(null);
    } catch (e: any) {
      toast.error(e.message);
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
                employee.phone,
                <Phone className="h-3.5 w-3.5" />,
              )}
              {readOnlyField(
                t("gabinet.employees.detailedData.email"),
                employee.email || userEmail || undefined,
                <Mail className="h-3.5 w-3.5" />,
              )}
              {readOnlyField(
                t("gabinet.employees.detailedData.dateOfBirth"),
                employee.dateOfBirth
                  ? new Date(employee.dateOfBirth + "T00:00:00").toLocaleDateString(i18nLanguage, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : undefined,
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
                readOnlyField(t("gabinet.employees.detailedData.notesComments"), employee.notes)}
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
