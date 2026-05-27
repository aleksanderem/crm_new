import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useSupabaseGabinetEmployeesList } from "@/hooks/use-supabase-gabinet-employees";
import { useSupabaseOrganizationMembers } from "@/hooks/use-supabase-organizations";
import { useSupabaseGabinetTreatmentsList } from "@/hooks/use-supabase-gabinet-treatments";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable, useColumnVisibility, useAllColumns, type CrmColumn } from "@/components/crm/enhanced-data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Avatar } from "@untitled/base/avatar/avatar";
import { EMPLOYEE_ROLES, employeeRoleOptions } from "@/lib/options";
import { Plus, Search, Trash2 } from "@/lib/ez-icons";
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import type { FieldDef, FilterCondition } from "@/components/crm/types";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { Id } from "@cvx/_generated/dataModel";
import type { MappedGabinetEmployee } from "@/lib/supabase/mappers/gabinet/employees";
import type { MappedGabinetTreatment } from "@/lib/supabase/mappers/gabinet/treatments";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { TagsManagerSlideout } from "@/components/categories-tags/tags-manager-slideout";
import { CategoriesManagerSlideout } from "@/components/categories-tags/categories-manager-slideout";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
import { applyFilterConditions } from "@/hooks/use-saved-views";
import { PlateText } from "@/components/plate-text";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";

// shadcn/studio statistics blocks
import StatisticsOrderCard from "@/components/shadcn-studio/blocks/statistics-order-card";
import StatisticsProfitCard from "@/components/shadcn-studio/blocks/statistics-profit-card";
import StatisticsImpressionCard from "@/components/shadcn-studio/blocks/statistics-impression-card";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/employees/"
)({
  component: EmployeesIndex,
});


type Employee = MappedGabinetEmployee;

function EmployeesIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
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

  const createEmployee = useAction(api.gabinet.employees.create);
  const removeEmployee = useAction(api.gabinet.employees.remove);

  const { data: employees } = useSupabaseGabinetEmployeesList(organizationId);

  const { data: members } = useSupabaseOrganizationMembers(organizationId);

  const { data: allTreatmentsRaw } = useSupabaseGabinetTreatmentsList(organizationId);
  const treatments: MappedGabinetTreatment[] = useMemo(
    () => (allTreatmentsRaw ?? []).filter((t) => t.isActive),
    [allTreatmentsRaw],
  );

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

  // Users not yet registered as employees
  const availableUsers = useMemo(() => {
    if (!members || !employees) return [] as Array<{ _id: Id<"users">; name?: string | null; email?: string | null }>;
    const empUserIds = new Set<string>(employees.map((e) => e.userId as string));
    return members
      .filter((m) => m.user && !empUserIds.has(m.userId))
      .map((m) => ({ _id: m.user!._id as Id<"users">, name: m.user!.name, email: m.user!.email }));
  }, [members, employees]);

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
      render: (item) => item.role ? t(`gabinet.employees.roles.${item.role}`) : "\u2014",
    },
    {
      id: "specialization",
      label: t("gabinet.employees.specialization"),
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

  const rowActions = useCallback(
    (row: Employee) => [
      {
        label: t("common.edit"),
        onClick: () => navigate({ to: `/dashboard/gabinet/employees/${row._id}` }),
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
      }
    },
    [removeEmployee, organizationId]
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
        ]}
        columnDefs={allColumns.map(c => ({ id: c.id, label: c.label ?? c.id }))}
        hiddenColumnIds={hiddenColumnIds}
        onToggleColumn={toggleColumn}
        onSetHiddenColumns={setHiddenColumns}
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
          { label: t("common.delete"), value: "delete", variant: "destructive" },
        ]}
        onBulkAction={handleBulkAction}
        rowActions={rowActions}
        onRowAction={(id) => navigate({ to: '/dashboard/gabinet/employees/$employeeId', params: { employeeId: id } })}
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

      {/* Create dialog */}
      <CreateEmployeeSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        availableUsers={availableUsers}
        treatments={treatments ?? []}
        organizationId={organizationId}
        onCreate={createEmployee}
        tags={tags}
        categories={categories}
        t={t}
      />
    </div>
  );
}

function CreateEmployeeSheet({
  open,
  onClose,
  availableUsers,
  treatments,
  organizationId,
  onCreate,
  tags,
  categories,
  t,
}: {
  open: boolean;
  onClose: () => void;
  availableUsers: Array<{ _id: Id<"users">; name?: string | null; email?: string | null }>;
  treatments: Array<{ _id: string; name: string }>;
  organizationId: Id<"organizations">;
  onCreate: any;
  tags: Array<{ _id: Id<"tagDefinitions">; name: string; color: string }>;
  categories: Array<{ _id: Id<"categoryDefinitions">; name: string; parentId?: Id<"categoryDefinitions">; color?: string }>;
  t: any;
}) {
  const [userId, setUserId] = useState<string>("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<string>("doctor");
  const [specialization, setSpecialization] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>([]);
  const [categoryId, setCategoryId] = useState<Id<"categoryDefinitions"> | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [treatmentSearch, setTreatmentSearch] = useState("");

  const filteredTreatments = useMemo(() => {
    const q = treatmentSearch.trim().toLowerCase();
    if (!q) return treatments;
    return treatments.filter((tr) => tr.name?.toLowerCase().includes(q));
  }, [treatments, treatmentSearch]);

  const handleCreate = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await onCreate({
        organizationId,
        userId: userId as Id<"users">,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        role: role as any,
        specialization: specialization || undefined,
        licenseNumber: licenseNumber || undefined,
        color: color || undefined,
        qualifiedTreatmentIds: selectedTreatments as Id<"gabinetTreatments">[],
        tagIds: tagIds.length > 0 ? tagIds : undefined,
        categoryId,
      });
      toast.success(t("common.created"));
      onClose();
      setUserId("");
      setFirstName("");
      setLastName("");
      setRole("doctor");
      setSpecialization("");
      setLicenseNumber("");
      setSelectedTreatments([]);
      setTagIds([]);
      setCategoryId(undefined);
      setTreatmentSearch("");
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
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("gabinet.employees.add")}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label>{t("gabinet.employees.selectUser")}</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder={t("gabinet.employees.selectUser")} /></SelectTrigger>
              <SelectContent>
                {availableUsers.map((u) => (
                  <SelectItem key={u._id} value={u._id}>
                    {u.name || u.email}
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
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYEE_ROLES.map((r) => (
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
            <Label>{t("gabinet.employees.color")}</Label>
            <input
              type="color"
              className="h-9 w-16 cursor-pointer rounded border bg-transparent"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("gabinet.employees.qualifiedTreatments")}</Label>
            {treatments.length > 0 && (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                  variant="stroke"
                />
                <Input
                  type="search"
                  value={treatmentSearch}
                  onChange={(e) => setTreatmentSearch(e.target.value)}
                  placeholder={t("gabinet.treatments.searchPlaceholder")}
                  className="pl-8"
                />
              </div>
            )}
            <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
              {filteredTreatments.length > 0 && (
                <label className="-mx-2 -mt-2 mb-1 flex items-center gap-2 rounded-t bg-muted/60 px-2 py-2 text-sm font-medium cursor-pointer border-b">
                  <Checkbox
                    checked={
                      filteredTreatments.every((tr) => selectedTreatments.includes(tr._id))
                        ? true
                        : filteredTreatments.some((tr) => selectedTreatments.includes(tr._id))
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(checked) => {
                      const visibleIds = filteredTreatments.map((tr) => tr._id);
                      if (checked === true) {
                        setSelectedTreatments(
                          Array.from(new Set([...selectedTreatments, ...visibleIds])),
                        );
                      } else {
                        const visibleSet = new Set(visibleIds);
                        setSelectedTreatments(
                          selectedTreatments.filter((id) => !visibleSet.has(id)),
                        );
                      }
                    }}
                  />
                  {t("common.selectAll")}
                </label>
              )}
              {filteredTreatments.map((tr) => (
                <label key={tr._id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedTreatments.includes(tr._id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedTreatments([...selectedTreatments, tr._id]);
                      } else {
                        setSelectedTreatments(selectedTreatments.filter((id) => id !== tr._id));
                      }
                    }}
                  />
                  {tr.name}
                </label>
              ))}
              {treatments.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">{t("gabinet.employees.noTreatments")}</p>
              )}
              {treatments.length > 0 && filteredTreatments.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">{t("detail.relationships.noResults")}</p>
              )}
            </div>
          </div>

          {tags.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t('common.tags', { defaultValue: "Tagi" })}</Label>
              <TagsPicker tags={tags} selectedIds={tagIds} onChange={setTagIds} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t('common.category', { defaultValue: "Kategoria" })}</Label>
            <CategoryPicker
              categories={categories}
              selectedId={categoryId}
              onChange={setCategoryId}
              organizationId={organizationId}
              entityType="gabinetEmployee"
            />
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleCreate} disabled={!userId || saving}>
            {saving ? t("common.saving") : t("common.create")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
