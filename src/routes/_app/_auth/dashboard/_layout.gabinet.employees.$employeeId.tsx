import { useState, useMemo, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { SidePanel } from "@/components/crm/side-panel";
import { ActivityForm } from "@/components/crm/activity-form";
import type { ActivityType } from "@/components/crm/activity-form";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
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
  ChevronUp,
  Pencil,
  Settings2,
  Search,
  X,
  Calendar,
  Clock,
  User,
  Plus,
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
  const { t } = useTranslation();

  // Mutations
  const updateEmployee = useMutation(api["gabinet/employees"].update);
  const removeEmployee = useMutation(api["gabinet/employees"].remove);
  const setQualifiedTreatments = useMutation(api["gabinet/employees"].setQualifiedTreatments);
  const createNote = useMutation(api.notes.create);
  const createScheduledActivity = useMutation(api.scheduledActivities.create);
  const markActivityComplete = useMutation(api.scheduledActivities.markComplete);
  const markActivityIncomplete = useMutation(api.scheduledActivities.markIncomplete);
  const updateScheduledActivity = useMutation(api.scheduledActivities.update);
  const removeScheduledActivity = useMutation(api.scheduledActivities.remove);
  const bulkSetEmployeeSchedule = useMutation(api["gabinet/scheduling"].bulkSetEmployeeSchedule);

  // UI state
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);
  const [treatmentSearch, setTreatmentSearch] = useState("");
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Queries
  const { data: currentUser } = useQuery(
    convexQuery(api.app.getCurrentUser, {})
  );

  const { data: employee, isLoading } = useQuery(
    convexQuery(api["gabinet/employees"].getById, {
      organizationId,
      employeeId: employeeId as Id<"gabinetEmployees">,
    })
  );

  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );

  const { data: treatments } = useQuery(
    convexQuery(api["gabinet/treatments"].listActive, { organizationId })
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
    ...convexQuery(api["gabinet/appointments"].listByEmployee, {
      organizationId,
      employeeId: (employee?.userId ?? "") as Id<"users">,
    }),
    enabled: !!employee,
  });

  // Unique patients this employee has seen
  const { data: employeePatients } = useQuery({
    ...convexQuery(api["gabinet/appointments"].listPatientsForEmployee, {
      organizationId,
      employeeId: (employee?.userId ?? "") as Id<"users">,
    }),
    enabled: !!employee,
  });

  // Employee schedule (per-employee working hours)
  const { data: employeeScheduleData } = useQuery({
    ...convexQuery(api["gabinet/scheduling"].getEmployeeSchedule, {
      organizationId,
      userId: (employee?.userId ?? "") as Id<"users">,
    }),
    enabled: !!employee,
  });

  // Clinic-wide working hours (fallback)
  const { data: clinicHours } = useQuery(
    convexQuery(api["gabinet/scheduling"].getWorkingHours, { organizationId })
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

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-12 w-64" />
        <div className="flex gap-6">
          <Skeleton className="h-96 w-[420px]" />
          <Skeleton className="h-96 flex-1" />
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{t("common.notFound")}</p>
      </div>
    );
  }

  // --- Derived data ---

  const user = userMap.get(employee.userId);
  const fullName =
    employee.firstName || employee.lastName
      ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim()
      : user?.name || user?.email || t("common.unknown");
  const avatarFallback =
    (employee.firstName?.[0] ?? user?.name?.[0] ?? "?") +
    (employee.lastName?.[0] ?? "");

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
    const updated = [...employee.qualifiedTreatmentIds, treatmentId as Id<"gabinetTreatments">];
    await setQualifiedTreatments({
      organizationId,
      employeeId: employeeId as Id<"gabinetEmployees">,
      treatmentIds: updated,
    });
    setTreatmentSearch("");
  };

  const handleRemoveTreatment = async (treatmentId: string) => {
    const updated = employee.qualifiedTreatmentIds.filter((id) => id !== treatmentId);
    await setQualifiedTreatments({
      organizationId,
      employeeId: employeeId as Id<"gabinetEmployees">,
      treatmentIds: updated as Id<"gabinetTreatments">[],
    });
  };

  const handleCreateActivity = async (data: {
    title: string;
    activityType: ActivityType;
    dueDate: number;
    endDate?: number;
    description?: string;
    note?: string;
    isCompleted?: boolean;
  }) => {
    if (!currentUser) return;
    const activityId = await createScheduledActivity({
      organizationId,
      title: data.title,
      activityType: data.activityType,
      dueDate: data.dueDate,
      endDate: data.endDate,
      description: data.description,
      ownerId: currentUser._id as Id<"users">,
      linkedEntityType: "gabinetEmployee",
      linkedEntityId: employeeId,
    });
    if (data.isCompleted && activityId) {
      await markActivityComplete({ organizationId, activityId });
    }
    if (data.note) {
      await createNote({
        organizationId,
        entityType: "gabinetEmployee",
        entityId: employeeId,
        content: data.note,
      });
    }
    setShowActivityForm(false);
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

  // Detail fields
  const allFields = [
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
  ];

  const defaultVisibleCount = 5;
  const visibleFields = showAllFields ? allFields : allFields.slice(0, defaultVisibleCount);
  const hiddenCount = allFields.length - defaultVisibleCount;

  const tabTriggerClass =
    "rounded-none border-b-2 border-transparent px-4 pb-2.5 pt-1.5 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none";

  return (
    <>
      <div className="flex h-full flex-col bg-muted/30">
        {/* Top header bar */}
        <div className="flex items-center justify-between border-b bg-background px-6 py-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                {avatarFallback}
              </AvatarFallback>
            </Avatar>
            <h1 className="text-xl font-bold">{fullName}</h1>
            {employee.color && (
              <span
                className="h-3 w-3 rounded-full"
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

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {t("detail.actions.actions")}
                  <ChevronDown className="ml-1 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditDrawerOpen(true)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
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
          </div>
        </div>

        {/* Main content: sidebar + tabs */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar */}
          <ScrollArea className="w-[420px] shrink-0 border-r bg-background">
            <div className="p-5 space-y-4">
              {/* Details card */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{t("gabinet.employees.details")}</CardTitle>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditDrawerOpen(true)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Settings2 className="h-3.5 w-3.5" />
                      </Button>
                      {hiddenCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => setShowAllFields(!showAllFields)}
                        >
                          {showAllFields
                            ? t("gabinet.employees.showLess")
                            : t("gabinet.employees.showMore", { count: hiddenCount })}
                          {showAllFields ? (
                            <ChevronUp className="ml-1 h-3 w-3" />
                          ) : (
                            <ChevronDown className="ml-1 h-3 w-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {visibleFields.map((field) => (
                    <div key={field.fieldKey} className="flex items-start gap-4">
                      <span className="w-28 shrink-0 text-right text-sm text-muted-foreground">
                        {field.label}
                      </span>
                      <span className="text-sm font-medium text-primary">
                        {field.value || "—"}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Notes card */}
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

              {/* Treatment Qualifications card */}
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
                            <X className="h-3 w-3" />
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
                      <Search className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
            </div>
          </ScrollArea>

          {/* Right content area with tabs */}
          <div className="flex flex-1 flex-col overflow-hidden bg-background">
            <Tabs defaultValue="appointments" className="flex flex-1 flex-col">
              <div className="shrink-0 border-b px-6 pt-2">
                <TabsList className="h-10 bg-transparent p-0 gap-0">
                  <TabsTrigger value="appointments" className={tabTriggerClass}>
                    {t("gabinet.employees.tabs.appointments")}
                  </TabsTrigger>
                  <TabsTrigger value="patients" className={tabTriggerClass}>
                    {t("gabinet.employees.tabs.patients")}
                  </TabsTrigger>
                  <TabsTrigger value="activities" className={tabTriggerClass}>
                    {t("gabinet.employees.tabs.activities")}
                  </TabsTrigger>
                  <TabsTrigger value="schedule" className={tabTriggerClass}>
                    {t("gabinet.employees.tabs.schedule")}
                  </TabsTrigger>
                  <TabsTrigger value="notes" className={tabTriggerClass}>
                    {t("gabinet.employees.notes")}
                  </TabsTrigger>
                  <TabsTrigger value="history" className={tabTriggerClass}>
                    {t("gabinet.employees.activity")}
                  </TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="flex-1">
                {/* Appointments tab */}
                <TabsContent value="appointments" className="m-0 p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">
                        {t("gabinet.employees.tabs.appointments")}
                      </h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate({ to: "/dashboard/gabinet/calendar" })}
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        {t("gabinet.appointments.createAppointment")}
                      </Button>
                    </div>
                    {!employeeAppointments || employeeAppointments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Calendar className="h-10 w-10 text-muted-foreground/40 mb-3" />
                        <p className="text-sm text-muted-foreground">
                          {t("gabinet.appointments.noAppointments")}
                        </p>
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
                                className={`flex items-center gap-4 rounded-lg border p-3 ${isPast ? "opacity-60" : ""}`}
                              >
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                  <Calendar className="h-5 w-5 text-primary" />
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
                </TabsContent>

                {/* Patients tab */}
                <TabsContent value="patients" className="m-0 p-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">
                      {t("gabinet.employees.tabs.patients")}
                    </h3>
                    {!employeePatients || employeePatients.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <User className="h-10 w-10 text-muted-foreground/40 mb-3" />
                        <p className="text-sm text-muted-foreground">
                          {t("gabinet.employees.tabs.noPatients")}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {employeePatients.map((pat) => (
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
                            {!pat.isActive && (
                              <Badge variant="outline" className="text-muted-foreground">
                                {t("common.inactive")}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Activities tab (scheduled activities + form) */}
                <TabsContent value="activities" className="m-0 p-6">
                  <div className="space-y-4">
                    {!showActivityForm && (
                      <div className="flex items-center justify-between rounded-lg border p-4">
                        <div>
                          <h3 className="font-semibold">
                            {t("detail.activitySection.title")}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {t("detail.activitySection.descriptionOther")}
                          </p>
                        </div>
                        <Button
                          className="bg-primary"
                          onClick={() => setShowActivityForm(true)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          {t("detail.activitySection.add")}
                        </Button>
                      </div>
                    )}

                    {showActivityForm && (
                      <div className="rounded-lg border p-5">
                        <ActivityForm
                          linkedEntityType="gabinetEmployee"
                          linkedEntityLabel={fullName}
                          onSubmit={handleCreateActivity}
                          onCancel={() => setShowActivityForm(false)}
                          isSubmitting={isSubmitting}
                          activityTypes={activityTypeDefs}
                        />
                      </div>
                    )}

                    {scheduledActivitiesData && scheduledActivitiesData.length > 0 ? (
                      <ul className="space-y-3">
                        {scheduledActivitiesData.map((activity) => (
                          <li
                            key={activity._id}
                            className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => {
                              setSelectedActivityId(activity._id);
                              setActivityDrawerOpen(true);
                            }}
                          >
                            <div
                              className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                                activity.isCompleted ? "bg-green-500" : "bg-orange-400"
                              }`}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{activity.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {activity.activityType} &middot;{" "}
                                {new Date(activity.dueDate).toLocaleDateString("pl-PL")}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      !showActivityForm && (
                        <p className="text-sm text-muted-foreground">
                          {t("detail.activitySection.emptyContact")}
                        </p>
                      )
                    )}
                  </div>
                </TabsContent>

                {/* Notes tab */}
                <TabsContent value="notes" className="m-0 p-6">
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
                        <Plus className="h-4 w-4 mr-1" />
                        {t("detail.notes.add")}
                      </Button>
                    </div>

                    {isAddingNote && (
                      <div className="space-y-2 rounded-lg border p-4">
                        <Textarea
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          placeholder={t("detail.notes.placeholderAlt")}
                          rows={4}
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
                            <p className="text-sm whitespace-pre-wrap">{note.content}</p>
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
                </TabsContent>

                {/* Schedule tab */}
                <TabsContent value="schedule" className="m-0 p-6">
                  <EmployeeScheduleEditor
                    organizationId={organizationId}
                    userId={employee.userId as Id<"users">}
                    employeeSchedule={employeeScheduleData ?? []}
                    clinicHours={clinicHours ?? []}
                    onSave={bulkSetEmployeeSchedule}
                    t={t}
                  />
                </TabsContent>

                {/* Activity history tab */}
                <TabsContent value="history" className="m-0 p-6">
                  <ActivityTimeline
                    activities={
                      activities?.map((a) => ({
                        _id: a._id,
                        action: a.action,
                        description: a.description,
                        createdAt: a.createdAt,
                      })) ?? []
                    }
                    maxHeight="600px"
                  />
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Edit employee drawer */}
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
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          />
        </div>
      </div>
    </SidePanel>
  );
}

// --- Employee schedule editor ---

const DAY_NAMES_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_PL = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];

interface DaySchedule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isWorking: boolean;
  breakStart: string;
  breakEnd: string;
}

function EmployeeScheduleEditor({
  organizationId,
  userId,
  employeeSchedule,
  clinicHours,
  onSave,
  t,
}: {
  organizationId: Id<"organizations">;
  userId: Id<"users">;
  employeeSchedule: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isWorking: boolean;
    breakStart?: string;
    breakEnd?: string;
  }>;
  clinicHours: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isOpen: boolean;
    breakStart?: string;
    breakEnd?: string;
  }>;
  onSave: any;
  t: any;
}) {
  const { i18n } = useTranslation();
  const [saving, setSaving] = useState(false);

  // Build initial schedule: employee overrides on top of clinic defaults
  const buildSchedule = (): DaySchedule[] =>
    Array.from({ length: 7 }, (_, i) => {
      const empDay = employeeSchedule.find((s) => s.dayOfWeek === i);
      if (empDay) {
        return {
          dayOfWeek: i,
          startTime: empDay.startTime,
          endTime: empDay.endTime,
          isWorking: empDay.isWorking,
          breakStart: empDay.breakStart ?? "",
          breakEnd: empDay.breakEnd ?? "",
        };
      }
      const clinicDay = clinicHours.find((h) => h.dayOfWeek === i);
      if (clinicDay) {
        return {
          dayOfWeek: i,
          startTime: clinicDay.startTime,
          endTime: clinicDay.endTime,
          isWorking: clinicDay.isOpen,
          breakStart: clinicDay.breakStart ?? "",
          breakEnd: clinicDay.breakEnd ?? "",
        };
      }
      return {
        dayOfWeek: i,
        startTime: "08:00",
        endTime: "17:00",
        isWorking: i >= 1 && i <= 5,
        breakStart: "",
        breakEnd: "",
      };
    });

  const [hours, setHours] = useState<DaySchedule[]>(buildSchedule);

  useEffect(() => {
    setHours(buildSchedule());
  }, [employeeSchedule, clinicHours]);

  const updateDay = (dayOfWeek: number, field: keyof DaySchedule, value: string | boolean) => {
    setHours((prev) =>
      prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        organizationId,
        userId,
        hours: hours.map((h) => ({
          dayOfWeek: h.dayOfWeek,
          startTime: h.startTime,
          endTime: h.endTime,
          isWorking: h.isWorking,
          breakStart: h.breakStart || undefined,
          breakEnd: h.breakEnd || undefined,
        })),
      });
      toast.success(t("common.saved"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const dayNames = i18n.language === "pl" ? DAY_NAMES_PL : DAY_NAMES_EN;
  const hasOverrides = employeeSchedule.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {t("gabinet.employees.tabs.schedule")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {hasOverrides
              ? t("gabinet.employees.schedule.hasOverrides")
              : t("gabinet.employees.schedule.usingClinicDefaults")}
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[160px_60px_1fr_1fr_1fr_1fr] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>{t("gabinet.scheduling.day")}</span>
          <span>{t("gabinet.scheduling.open")}</span>
          <span>{t("gabinet.scheduling.start")}</span>
          <span>{t("gabinet.scheduling.end")}</span>
          <span>{t("gabinet.scheduling.breakStart")}</span>
          <span>{t("gabinet.scheduling.breakEnd")}</span>
        </div>

        {hours.map((h) => (
          <div
            key={h.dayOfWeek}
            className="grid grid-cols-[160px_60px_1fr_1fr_1fr_1fr] items-center gap-2 border-b px-4 py-2 last:border-b-0"
          >
            <span className="text-sm font-medium">{dayNames[h.dayOfWeek]}</span>
            <Checkbox
              checked={h.isWorking}
              onCheckedChange={(checked) => updateDay(h.dayOfWeek, "isWorking", checked as boolean)}
            />
            <Input
              type="time"
              className="h-8 w-24"
              value={h.startTime}
              onChange={(e) => updateDay(h.dayOfWeek, "startTime", e.target.value)}
              disabled={!h.isWorking}
            />
            <Input
              type="time"
              className="h-8 w-24"
              value={h.endTime}
              onChange={(e) => updateDay(h.dayOfWeek, "endTime", e.target.value)}
              disabled={!h.isWorking}
            />
            <Input
              type="time"
              className="h-8 w-24"
              value={h.breakStart}
              onChange={(e) => updateDay(h.dayOfWeek, "breakStart", e.target.value)}
              disabled={!h.isWorking}
            />
            <Input
              type="time"
              className="h-8 w-24"
              value={h.breakEnd}
              onChange={(e) => updateDay(h.dayOfWeek, "breakEnd", e.target.value)}
              disabled={!h.isWorking}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
