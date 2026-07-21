import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useSupabaseGabinetEmployeesList } from "@/hooks/use-supabase-gabinet-employees";
import { useSupabaseGabinetEmployeeSchedulesList } from "@/hooks/use-supabase-gabinet-employee-schedules";
import { useSupabaseGabinetWorkingHoursList } from "@/hooks/use-supabase-gabinet-working-hours";
import { useSupabaseOrganizationMembers } from "@/hooks/use-supabase-organizations";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable, useColumnVisibility, useAllColumns, type CrmColumn } from "@/components/crm/enhanced-data-table";
import { SidePanel } from "@/components/crm/side-panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar } from "@untitled/base/avatar/avatar";
import { employeeRoleOptions } from "@/lib/options";
import { Calendar, Plus, Trash2 } from "@/lib/ez-icons";
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import type { FieldDef, FilterCondition } from "@/components/crm/types";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { Id } from "@cvx/_generated/dataModel";
import type { MappedGabinetEmployee } from "@/lib/supabase/mappers/gabinet/employees";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { TagsManagerSlideout } from "@/components/categories-tags/tags-manager-slideout";
import { CategoriesManagerSlideout } from "@/components/categories-tags/categories-manager-slideout";
import { applyFilterConditions } from "@/hooks/use-saved-views";
import { PlateText } from "@/components/plate-text";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { EmployeeForm } from "@/components/forms/employee-form";
import { EventDialog } from "@/components/gabinet/calendar/event-dialog";
import { PermissionGate } from "@/hooks/use-permission";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FlexibleScheduleEditor,
  groupSchedulesIntoPeriods,
} from "@/components/gabinet/flexible-schedule-editor";

// shadcn/studio statistics blocks
import StatisticsOrderCard from "@/components/shadcn-studio/blocks/statistics-order-card";
import StatisticsProfitCard from "@/components/shadcn-studio/blocks/statistics-profit-card";
import StatisticsImpressionCard from "@/components/shadcn-studio/blocks/statistics-impression-card";

function EmployeesIndexSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/employees/"
)({
  component: () => (
    <PermissionGate feature="gabinet_employees" action="view" loadingFallback={<EmployeesIndexSkeleton />}>
      <EmployeesIndex />
    </PermissionGate>
  ),
});


type Employee = MappedGabinetEmployee;

function EmployeesIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tags } = useTagDefinitions(organizationId);
  const { categories } = useCategoryDefinitions(organizationId, "gabinetEmployee");
  const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);
  const [categoriesSlideoutOpen, setCategoriesSlideoutOpen] = useState(false);
  const [filterSlideoutOpen, setFilterSlideoutOpen] = useState(false);

  useSidebarDispatch("manageTags", () => setTagsSlideoutOpen(true));
  useSidebarDispatch("manageCategories", () => setCategoriesSlideoutOpen(true));
  useSidebarDispatch("openFilter", () => setFilterSlideoutOpen(true));

  const [showCreate, setShowCreate] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [activeFilters, setActiveFilters] = useState<FilterCondition[]>([]);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventDefaultUserIds, setEventDefaultUserIds] = useState<string[]>([]);
  const [editingScheduleEmployee, setEditingScheduleEmployee] =
    useState<Employee | null>(null);

  const filterableFields = useMemo((): FieldDef[] => [
    { id: "firstName", label: t("gabinet.employees.firstName"), type: "text" },
    { id: "lastName", label: t("gabinet.employees.lastName"), type: "text" },
    { id: "email", label: t("common.email"), type: "text" },
    { id: "phone", label: t("common.phone"), type: "text" },
    {
      id: "role", label: t("gabinet.employees.role"), type: "select",
      options: employeeRoleOptions(t),
    },
    { id: "specialization", label: t("gabinet.employees.specialization"), type: "text" },
    { id: "position", label: t("gabinet.employees.position"), type: "text" },
    { id: "department", label: t("gabinet.employees.department"), type: "text" },
    {
      id: "isActive", label: t("common.active"), type: "select",
      options: [
        { label: t("common.yes"), value: "true" },
        { label: t("common.no"), value: "false" },
      ],
    },
    { id: "tagIds", label: t('common.tags', { defaultValue: "Tagi" }), type: "multiSelect" as const, options: tags.map(tag => ({ label: tag.name, value: tag._id })) },
    { id: "categoryId", label: t('common.category', { defaultValue: "Kategoria" }), type: "select" as const, options: categories.map(cat => ({ label: cat.name, value: cat._id })) },
  ], [t, tags, categories]);

  const removeEmployee = useAction(api.gabinet.employees.remove);
  const bulkSetEmployeeSchedule = useAction(
    // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
    api.gabinet.scheduling.bulkSetEmployeeSchedule,
  );
  const saveSchedulePeriod = useAction(
    // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
    api.gabinet.scheduling.saveSchedulePeriod,
  );
  const removeSchedulePeriod = useAction(
    // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
    api.gabinet.scheduling.removeSchedulePeriod,
  );

  const { data: employees } = useSupabaseGabinetEmployeesList(organizationId);

  const { data: members } = useSupabaseOrganizationMembers(organizationId);
  const { data: employeeSchedules } =
    useSupabaseGabinetEmployeeSchedulesList(organizationId);
  const { data: clinicHours } = useSupabaseGabinetWorkingHoursList(organizationId);

  const getEmployeesKpis = useAction(api.gabinet.sidebarWidgets.getEmployeesKpis);
  const getStaffLoad = useAction(api.gabinet.sidebarWidgets.getStaffLoad);
  const { data: kpis } = useQuery({
    queryKey: ["gabinet.sidebarWidgets.getEmployeesKpis", organizationId],
    queryFn: () => getEmployeesKpis({ organizationId }),
    enabled: !!organizationId,
  });
  const { data: staffLoad } = useQuery({
    queryKey: ["gabinet.sidebarWidgets.getStaffLoad", organizationId],
    queryFn: () => getStaffLoad({ organizationId }),
    enabled: !!organizationId,
  });

  // Build sparkline for staff load
  const staffChartData = useMemo(() => {
    if (!staffLoad?.length) return undefined;
    return staffLoad.slice(0, 7).map((s) => ({
      day: s.name.split(" ")[0] ?? s.name,
      orders: s.appointmentCount,
    }));
  }, [staffLoad]);

  const userMap = useMemo(() => {
    const map = new Map<string, { name?: string | null; email?: string | null }>();
    members?.forEach((m) => {
      if (m.user) map.set(m.userId, m.user);
    });
    return map;
  }, [members]);

  function getDisplayName(emp: { firstName?: string; lastName?: string; userId: string }) {
    if (emp.firstName || emp.lastName) {
      return `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim();
    }
    const user = userMap.get(emp.userId);
    return user?.name || user?.email || t("common.unknown");
  }

  function getInitials(emp: { firstName?: string; lastName?: string; userId: string }) {
    if (emp.firstName || emp.lastName) {
      return `${(emp.firstName ?? "")[0] ?? ""}${(emp.lastName ?? "")[0] ?? ""}`.toUpperCase();
    }
    const user = userMap.get(emp.userId);
    const name = user?.name || user?.email || "?";
    return name.substring(0, 2).toUpperCase();
  }

  const columns: CrmColumn<Employee>[] = useMemo(() => [
    {
      id: "firstName",
      label: t("gabinet.employees.employee"),
      sortable: true,
      isRowHeader: true,
      className: "min-w-[200px]",
      render: (item) => {
        const displayName = getDisplayName(item);
        const initials = getInitials(item);
        const user = userMap.get(item.userId);
        return (
          <div className="flex items-center gap-3">
            <Avatar size="sm" initials={initials} />
            <div>
              <Link
                to="/dashboard/gabinet/employees/$employeeId"
                params={{ employeeId: item._id }}
                className="font-medium text-fg-primary hover:text-brand-secondary"
              >
                {displayName}
              </Link>
              {user?.email && (
                <p className="text-xs text-fg-quaternary">{user.email}</p>
              )}
            </div>
            {!item.isActive && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                {t("common.inactive")}
              </Badge>
            )}
          </div>
        );
      },
      getSortValue: (item) => getDisplayName(item),
    },
    {
      id: "role",
      label: t("gabinet.employees.role"),
      className: "min-w-[120px]",
      render: (item) => item.role ? t(`gabinet.employees.roles.${item.role}`) : "\u2014",
    },
    {
      id: "specialization",
      label: t("gabinet.employees.specialization"),
      className: "min-w-[140px]",
      render: (item) => item.specialization ?? "\u2014",
    },
    {
      id: "licenseNumber",
      label: t("gabinet.employees.license"),
      render: (item) => item.licenseNumber ?? "\u2014",
    },
    {
      id: "hireDate",
      label: t("gabinet.employees.hireDate"),
      render: (item) => item.hireDate ?? "\u2014",
    },
    {
      id: "color",
      label: t("gabinet.employees.color"),
      render: (item) =>
        item.color ? (
          <span
            className="inline-block h-4 w-4 rounded-full"
            style={{ backgroundColor: item.color }}
          />
        ) : (
          "\u2014"
        ),
    },
    {
      id: "notes",
      label: t("gabinet.employees.notes"),
      render: (item) => <PlateText value={item.notes} fallback="\u2014" />,
    },
    {
      id: "isActive",
      label: t("gabinet.employees.active"),
      render: (item) => (item.isActive ? "\u2713" : "\u2014"),
    },
    {
      id: "createdAt",
      label: t("common.created"),
      sortable: true,
      render: (item) => new Date(item.createdAt).toLocaleDateString(),
      getSortValue: (item) => item.createdAt,
    },
  ], [t, userMap]);

  const filteredEmployees = useMemo(() => {
    const data = applyFilterConditions(employees ?? [], activeFilters);
    if (!searchValue.trim()) return data;
    const q = searchValue.toLowerCase();
    return data.filter((e) => {
      const name = getDisplayName(e).toLowerCase();
      return name.includes(q) || e.specialization?.toLowerCase().includes(q) || e.role?.toLowerCase().includes(q);
    });
  }, [employees, activeFilters, searchValue]);

  const { allColumns, defaultHidden } = useAllColumns(columns, filterableFields);
  const { hiddenColumnIds, toggleColumn, setHiddenColumns } = useColumnVisibility(defaultHidden, "gabinet-employees");
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);

  const editingSchedulePeriods = useMemo(() => {
    if (!editingScheduleEmployee) return [];
    const own = (employeeSchedules ?? []).filter(
      (s) => s.userId === editingScheduleEmployee.userId,
    );
    return groupSchedulesIntoPeriods(own);
  }, [employeeSchedules, editingScheduleEmployee]);

  const editorClinicHours = useMemo(
    () =>
      (clinicHours ?? []).map((h) => ({
        dayOfWeek: h.dayOfWeek,
        startTime: h.startTime,
        endTime: h.endTime,
        isOpen: h.isOpen,
        breakStart: h.breakStart ?? undefined,
        breakEnd: h.breakEnd ?? undefined,
      })),
    [clinicHours],
  );

  const invalidateScheduleCache = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: supabaseKeys.gabinetEmployeeSchedules.list(organizationId),
    });
  }, [queryClient, organizationId]);

  const rowActions = useCallback(
    (row: Employee) => [
      {
        label: t("common.edit"),
        onClick: () => navigate({ to: `/dashboard/gabinet/employees/${row._id}` }),
      },
      {
        label: t("gabinet.timetable.editTitle"),
        icon: <Calendar className="h-4 w-4" variant="stroke" />,
        onClick: () => setEditingScheduleEmployee(row),
      },
      {
        label: t("common.delete"),
        icon: <Trash2 className="h-4 w-4" variant="stroke" />,
        onClick: async () => {
          if (window.confirm(t("gabinet.employees.confirmDelete"))) {
            await removeEmployee({ organizationId, employeeId: row._id as Id<"gabinetEmployees"> });
          }
        },
      },
    ],
    [navigate, removeEmployee, organizationId, t]
  );

  const handleBulkAction = useCallback(
    async (action: string, selectedRows: Employee[]) => {
      if (action === "delete") {
        for (const row of selectedRows) {
          await removeEmployee({ organizationId, employeeId: row._id as Id<"gabinetEmployees"> });
        }
      } else if (action === "addEvent") {
        // EventDialog identifies employees by userId (it creates one
        // scheduledActivity per resourceId=userId so the block lands in each
        // selected employee's calendar column).
        setEventDefaultUserIds(selectedRows.map((row) => row.userId));
        setEventDialogOpen(true);
      } else if (action === "edit") {
        const first = selectedRows[0];
        if (first) navigate({ to: `/dashboard/gabinet/employees/${first._id}` });
      }
    },
    [removeEmployee, organizationId, navigate]
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("gabinet.employees.title")}
        description={t("gabinet.employees.description")}
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" variant="stroke" />
            {t("gabinet.employees.add")}
          </Button>
        }
      />

      {/* KPI Statistics Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatisticsOrderCard
          title={t("gabinet.employees.activeEmployees", "Aktywni pracownicy")}
          description={t("gabinet.employees.currentlyActive", "Obecnie aktywni")}
          value={String(kpis?.activeCount ?? 0)}
          changePercentage={`${(employees ?? []).length} ${t("gabinet.employees.totalShort", "łącznie")}`}
          chartData={staffChartData}
        />
        <StatisticsProfitCard
          title={t("gabinet.employees.onLeave", "Na urlopie")}
          description={t("gabinet.employees.today", "Dziś")}
          value={String(kpis?.onLeave ?? 0)}
          changePercentage={
            kpis && kpis.onLeave > 0
              ? t("gabinet.employees.absent", "nieobecni")
              : t("gabinet.employees.allPresent", "wszyscy obecni")
          }
        />
        <StatisticsImpressionCard
          title={t("gabinet.employees.pendingLeaveReqs", "Wnioski urlopowe")}
          description={t("gabinet.employees.awaitingApproval", "Oczekujące")}
          value={String(kpis?.pendingLeaveRequests ?? 0)}
          changePercentage={
            kpis && kpis.pendingLeaveRequests > 0
              ? t("gabinet.employees.requiresAction", "wymaga akcji")
              : t("gabinet.employees.noPending", "brak oczekujących")
          }
        />
      </div>

      <DataListFilterBar
        filterableFields={filterableFields}
        filterSlideoutOpen={filterSlideoutOpen}
        onFilterSlideoutOpenChange={setFilterSlideoutOpen}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder={t("gabinet.employees.searchPlaceholder")}
        dropdownActions={[
          {
            label: t("quickActions.newEmployee"),
            icon: <Plus className="mr-1.5 h-4 w-4" variant="stroke" />,
            onClick: () => setShowCreate(true),
          },
          {
            label: t("gabinet.timetable.title"),
            icon: <Calendar className="mr-1.5 h-4 w-4" variant="stroke" />,
            onClick: () => navigate({ to: "/dashboard/gabinet/settings/timetable" }),
          },
        ]}
        columnDefs={allColumns.map(c => ({ id: c.id, label: c.label ?? c.id }))}
        hiddenColumnIds={hiddenColumnIds}
        onToggleColumn={toggleColumn}
        onSetHiddenColumns={setHiddenColumns}
        onColumnSettingsOpen={() => setColumnSettingsOpen(true)}
        onFiltersChange={setActiveFilters}
        onTagsManage={() => setTagsSlideoutOpen(true)}
        onCategoriesManage={() => setCategoriesSlideoutOpen(true)}
      />

      <CrmDataTable
        columns={allColumns}
        data={filteredEmployees}
        enableBulkSelect
        hiddenColumnIds={hiddenColumnIds}
        bulkActions={[
          { label: t("common.edit"), value: "edit" },
          { label: t("gabinet.events.create", { defaultValue: "Nowe zdarzenie" }), value: "addEvent" },
          { label: t("common.delete"), value: "delete", variant: "destructive" },
        ]}
        onBulkAction={handleBulkAction}
        rowActions={rowActions}
        onRowAction={(employeeId) =>
          navigate({ to: `/dashboard/gabinet/employees/${employeeId}` })
        }
      />

      <TagsManagerSlideout
        isOpen={tagsSlideoutOpen}
        onOpenChange={setTagsSlideoutOpen}
        organizationId={organizationId}
        tags={tags}
      />
      <CategoriesManagerSlideout
        isOpen={categoriesSlideoutOpen}
        onOpenChange={setCategoriesSlideoutOpen}
        organizationId={organizationId}
        entityType="gabinetEmployee"
        categories={categories}
      />

      <SidePanel
        open={columnSettingsOpen}
        onOpenChange={setColumnSettingsOpen}
        title={t("common.columnSettings", "Ustawienia kolumn")}
      >
        <div className="space-y-1 py-2">
          {allColumns.map((col) => {
            const isVisible = !hiddenColumnIds.has(col.id);
            return (
              <button
                key={col.id}
                type="button"
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                onClick={() => toggleColumn(col.id)}
              >
                <Checkbox checked={isVisible} className="pointer-events-none" aria-hidden />
                <span className="text-sm font-medium">{col.label ?? col.id}</span>
              </button>
            );
          })}
        </div>
      </SidePanel>

      <CreateEmployeeSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        organizationId={organizationId}
        tagDefinitions={tags}
        categoryDefinitions={categories}
      />

      <EventDialog
        organizationId={organizationId}
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
        defaultUserIds={eventDefaultUserIds}
      />

      {editingScheduleEmployee && (
        <Sheet
          open
          onOpenChange={(open) => !open && setEditingScheduleEmployee(null)}
        >
          <SheetContent
            side="right"
            className="flex flex-col sm:max-w-[760px] overflow-y-auto"
          >
            <SheetHeader>
              <SheetTitle>{t("gabinet.timetable.editTitle")}</SheetTitle>
              <SheetDescription>
                {getDisplayName(editingScheduleEmployee)}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto py-4">
              <FlexibleScheduleEditor
                organizationId={organizationId}
                userId={editingScheduleEmployee.userId as Id<"users">}
                periods={editingSchedulePeriods}
                clinicHours={editorClinicHours}
                onSavePeriod={async (a) => {
                  await saveSchedulePeriod(a);
                  invalidateScheduleCache();
                }}
                onRemovePeriod={async (a) => {
                  await removeSchedulePeriod(a);
                  invalidateScheduleCache();
                }}
                onSaveLegacy={async (a) => {
                  await bulkSetEmployeeSchedule(a);
                  invalidateScheduleCache();
                }}
                onManageLeaves={() =>
                  navigate({ to: "/dashboard/gabinet/settings/leaves" })
                }
              />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function CreateEmployeeSheet({
  open,
  onClose,
  organizationId,
  tagDefinitions,
  categoryDefinitions,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: Id<"organizations">;
  tagDefinitions: Array<{ _id: Id<"tagDefinitions">; name: string; color: string }>;
  categoryDefinitions: Array<{ _id: Id<"categoryDefinitions">; name: string; parentId?: Id<"categoryDefinitions">; color?: string }>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const createEmployee = useAction(api.gabinet.employees.create);
  const createInvitation = useAction(api.invitations.create);
  const [saving, setSaving] = useState(false);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("gabinet.employees.add")}</SheetTitle>
        </SheetHeader>

        <div className="py-4">
          <EmployeeForm
            key={open ? "open" : "closed"}
            tagDefinitions={tagDefinitions}
            categoryDefinitions={categoryDefinitions}
            isSubmitting={saving}
            onCancel={onClose}
            onSubmit={async (data) => {
              const shouldInvite = !!(data.grantSystemAccess && data.accessEmail);
              setSaving(true);
              try {
                if (!shouldInvite) {
                  await createEmployee({
                    organizationId,
                    ...data,
                    userId: data.userId,
                  });
                  toast.success(t("common.created"));
                  void queryClient.invalidateQueries({
                    queryKey: supabaseKeys.gabinetEmployees.list(organizationId),
                  });
                }
                if (shouldInvite) {
                  await createInvitation({
                    organizationId,
                    email: data.accessEmail!,
                    role: data.accessRole ?? "member",
                    module: "gabinet",
                    moduleData: {
                      firstName: data.firstName,
                      lastName: data.lastName,
                      role: data.role,
                      specialization: data.specialization,
                      color: data.color,
                      showInCalendar: data.showInCalendar,
                      qualifiedTreatmentIds: data.qualifiedTreatmentIds,
                      tagIds: data.tagIds,
                      categoryId: data.categoryId,
                      customFields: data.customFields,
                    },
                  });
                  toast.success(t("team.invitationSent"));
                  void queryClient.invalidateQueries({
                    queryKey: supabaseKeys.invitations.list(organizationId),
                  });
                  void queryClient.invalidateQueries({
                    queryKey: supabaseKeys.teamMemberships.list(organizationId),
                  });
                }
                onClose();
              } catch (e) {
                toast.error(
                  formatActionError(e, t, {
                    key: "gabinet.employees.errors.createFailed",
                    defaultValue: "Nie udało się dodać pracownika.",
                  }),
                );
              } finally {
                setSaving(false);
              }
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
