import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { api } from "@cvx/_generated/api";
import { useSupabaseGabinetPatientsList } from "@/hooks/use-supabase-gabinet-patients";
import { useSupabaseGabinetRecentVisitPatientIds } from "@/hooks/use-supabase-gabinet-appointments";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable, useColumnVisibility, useAllColumns, type CrmColumn } from "@/components/crm/enhanced-data-table";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import { MiniChartsRow, useChartsToggleState, ChartsToggleButton } from "@/components/crm/mini-charts";
import { SidePanel } from "@/components/crm/side-panel";
import { PatientForm } from "@/components/forms/patient-form";
import { MergePatientsDialog } from "@/components/gabinet/merge-patients-dialog";
import { Button } from "@/components/ui/button";
import { AvatarLabelGroup } from "@untitled/base/avatar/avatar-label-group";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Download, Users, AlertCircle } from "@/lib/ez-icons";
import { useCsvExport } from "@/components/csv/csv-export-button";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { Id } from "@cvx/_generated/dataModel";
import type { MappedGabinetPatient } from "@/lib/supabase/mappers/gabinet/patients";
import { useState, useMemo, useCallback } from "react";
import type { SortDescriptor } from "react-aria-components";
import { useTranslation } from "react-i18next";
import type { SavedView, TimeRange, FieldDef, FilterCondition } from "@/components/crm/types";
import type { MiniChartData } from "@/components/crm/mini-charts";
import { useSavedViews, applyFilterConditions } from "@/hooks/use-saved-views";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { TagsManagerSlideout } from "@/components/categories-tags/tags-manager-slideout";
import { CategoriesManagerSlideout } from "@/components/categories-tags/categories-manager-slideout";
import { formatPhoneNumber } from "@/lib/phone";
import { formatBirthDate } from "@/lib/format-date";
import { plateJsonToText } from "@/components/gabinet/rich-text-editor";
import { displayReferralSource } from "@/lib/options";

type PatientNudgeFilter = "missing-contact" | "no-recent-visit" | "duplicates";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/patients/",
)({
  component: PatientsIndex,
  validateSearch: (search: Record<string, unknown>): { nudge?: PatientNudgeFilter } => {
    const nudge =
      search.nudge === "missing-contact" ||
      search.nudge === "no-recent-visit" ||
      search.nudge === "duplicates"
        ? (search.nudge as PatientNudgeFilter)
        : undefined;
    return { nudge };
  },
});

function normalizeEmailKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizePhoneKey(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

type Patient = MappedGabinetPatient;

function PatientsIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { nudge: nudgeFilter } = useSearch({ from: Route.id });
  const createPatient = useAction(api.gabinet.patients.create);
  const removePatient = useAction(api.gabinet.patients.remove);

  const [panelOpen, setPanelOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [mergeSourcePatient, setMergeSourcePatient] = useState<Patient | null>(null);
  const [mergePreselectedTargetId, setMergePreselectedTargetId] = useState<string | null>(null);
  const [leftTimeRange, setLeftTimeRange] = useState<TimeRange>("last30days");
  const [rightTimeRange, setRightTimeRange] = useState<TimeRange>("all");
  const { open: chartsOpen, toggle: toggleCharts } = useChartsToggleState("gabinet-patients");
  const [savedViewsDialogOpen, setSavedViewsDialogOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [activeFilters, setActiveFilters] = useState<FilterCondition[]>([]);

  const { tags } = useTagDefinitions(organizationId);
  const { categories } = useCategoryDefinitions(organizationId, "gabinetPatient");
  const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);
  const [categoriesSlideoutOpen, setCategoriesSlideoutOpen] = useState(false);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor | undefined>({
    column: "firstName",
    direction: "ascending",
  });

  const { handleExport } = useCsvExport(organizationId, "patients", "pacjenci");

  // Sidebar dispatch handlers
  useSidebarDispatch("openAddPatient", () => setPanelOpen(true));
  useSidebarDispatch("exportCsv", () => handleExport());
  useSidebarDispatch("importCsv", () => {
    // Could open import dialog - for now show toast
    // Import not implemented for patients yet
  });
  useSidebarDispatch("openSearch", () => {
    // Focus on the search input if present
    const searchInput = document.querySelector<HTMLInputElement>(
      'input[type="search"], input[placeholder*="Szukaj"], input[placeholder*="Search"]',
    );
    searchInput?.focus();
  });
  useSidebarDispatch("openFilter", () => {
    // Toggle active/inactive filter
    const activeView = views.find((v) => v.id === "active");
    if (activeView) onViewChange("active");
  });
  useSidebarDispatch("savedViews", () => setSavedViewsDialogOpen(true));
  useSidebarDispatch("manageTags", () => setTagsSlideoutOpen(true));
  useSidebarDispatch("manageCategories", () => setCategoriesSlideoutOpen(true));

  const systemViews = useMemo(
    (): SavedView[] => [
      {
        id: "all",
        name: t("gabinet.patients.views.all"),
        isSystem: true,
        isDefault: true,
      },
      {
        id: "active",
        name: t("gabinet.patients.views.active"),
        isSystem: true,
        isDefault: false,
      },
      {
        id: "inactive",
        name: t("gabinet.patients.views.inactive"),
        isSystem: true,
        isDefault: false,
      },
    ],
    [t],
  );

  const filterableFields = useMemo(
    (): FieldDef[] => [
      { id: "firstName", label: t("gabinet.patients.firstName"), type: "text" },
      { id: "lastName", label: t("gabinet.patients.lastName"), type: "text" },
      { id: "email", label: t("common.email"), type: "text" },
      { id: "phone", label: t("common.phone"), type: "text" },
      {
        id: "gender",
        label: t("gabinet.patients.gender"),
        type: "select",
        options: [
          { label: t("gabinet.patients.genderOptions.male"), value: "male" },
          { label: t("gabinet.patients.genderOptions.female"), value: "female" },
          { label: t("gabinet.patients.genderOptions.other"), value: "other" },
        ],
      },
      {
        id: "referralSource",
        label: t("gabinet.patients.referralSource"),
        type: "text",
      },
      {
        id: "isActive",
        label: t("common.active"),
        type: "select",
        options: [
          { label: t("common.yes"), value: "true" },
          { label: t("common.no"), value: "false" },
        ],
      },
      { id: "createdAt", label: t("common.created"), type: "date" },
      { id: "tagIds", label: t('common.tags', { defaultValue: "Tagi" }), type: "multiSelect" as const, options: tags.map(tag => ({ label: tag.name, value: tag._id })) },
      { id: "categoryId", label: t('common.category', { defaultValue: "Kategoria" }), type: "select" as const, options: categories.map(cat => ({ label: cat.name, value: cat._id })) },
    ],
    [t, tags, categories],
  );

  const { data: patients = [], isLoading } = useSupabaseGabinetPatientsList(organizationId);
  const { data: recentVisitPatientIds } = useSupabaseGabinetRecentVisitPatientIds(
    organizationId,
    90,
    { enabled: nudgeFilter === "no-recent-visit" },
  );

  const {
    views,
    activeViewId,
    onViewChange,
    onCreateView,
    onDeleteView,
    applyFilters,
  } = useSavedViews({
    organizationId,
    entityType: "gabinetPatient",
    systemViews,
    defaultColumnVisibility: {},
  });

  const duplicatePatientIds = useMemo(() => {
    const emailToIds = new Map<string, string[]>();
    const phoneToIds = new Map<string, string[]>();
    for (const p of patients) {
      if (!p.isActive) continue;
      const emailKey = normalizeEmailKey(p.email);
      if (emailKey) {
        const ids = emailToIds.get(emailKey) ?? [];
        ids.push(p._id);
        emailToIds.set(emailKey, ids);
      }
      const phoneKey = normalizePhoneKey(p.phone);
      if (phoneKey) {
        const ids = phoneToIds.get(phoneKey) ?? [];
        ids.push(p._id);
        phoneToIds.set(phoneKey, ids);
      }
    }
    const ids = new Set<string>();
    for (const group of emailToIds.values()) {
      if (group.length > 1) group.forEach((id) => ids.add(id));
    }
    for (const group of phoneToIds.values()) {
      if (group.length > 1) group.forEach((id) => ids.add(id));
    }
    return ids;
  }, [patients]);

  const filteredPatients = useMemo(() => {
    let data: Patient[];
    switch (activeViewId) {
      case "active":
        data = patients.filter((p) => p.isActive);
        break;
      case "inactive":
        data = patients.filter((p) => !p.isActive);
        break;
      default:
        data = patients;
    }
    data = applyFilters(data);
    data = applyFilterConditions(data, activeFilters);
    if (nudgeFilter === "missing-contact") {
      data = data.filter((p) => !p.phone && !p.email);
    } else if (nudgeFilter === "no-recent-visit" && recentVisitPatientIds) {
      data = data.filter((p) => !recentVisitPatientIds.has(p._id));
    } else if (nudgeFilter === "duplicates") {
      data = data.filter((p) => duplicatePatientIds.has(p._id));
    }
    const q = searchValue.trim().toLowerCase();
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      data = data.filter((p) => {
        const haystack = [p.firstName, p.lastName, p.email, p.phone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return tokens.every((token) => haystack.includes(token));
      });
    }
    return data;
  }, [patients, activeViewId, applyFilters, activeFilters, searchValue, nudgeFilter, recentVisitPatientIds, duplicatePatientIds]);

  const patientsByDay = useMemo<MiniChartData[]>(() => {
    const dayMap = new Map<string, number>();
    for (const p of patients) {
      const day = new Date(p.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }
    return Array.from(dayMap.entries())
      .map(([label, value]) => ({ label, value }))
      .slice(-14);
  }, [patients]);

  const patientsBySource = useMemo<MiniChartData[]>(() => {
    const srcMap = new Map<string, number>();
    for (const p of patients) {
      const src = p.referralSource ? displayReferralSource(p.referralSource, t) : t("common.unknown");
      srcMap.set(src, (srcMap.get(src) ?? 0) + 1);
    }
    return Array.from(srcMap.entries()).map(([label, value]) => ({
      label,
      value,
    }));
  }, [patients, t]);

  const columns = useMemo(
    (): CrmColumn<Patient>[] => [
      {
        id: "firstName",
        label: t("gabinet.patients.contact"),
        sortable: true,
        isRowHeader: true,
        className: "min-w-[220px]",
        render: (item) => (
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard/gabinet/patients/$patientId"
              params={{ patientId: item._id }}
              className="hover:opacity-80"
            >
              <AvatarLabelGroup
                size="sm"
                src={["/images/avatars/blue.jpg", "/images/avatars/purple.jpg", "/images/avatars/red.jpg"][item._id.charCodeAt(item._id.length - 1) % 3]}
                initials={item.firstName[0] + item.lastName[0]}
                title={`${item.firstName} ${item.lastName}`}
                subtitle={item.email ?? (item.phone ? formatPhoneNumber(item.phone) : "—")}
              />
            </Link>
            {!item.isActive && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                {t("common.inactive")}
              </Badge>
            )}
          </div>
        ),
        getSortValue: (item) => item.firstName + " " + item.lastName,
      },
      {
        id: "email",
        label: t("common.email"),
        sortable: true,
        className: "min-w-[160px]",
        render: (item) => item.email ?? "—",
        getSortValue: (item) => item.email ?? "",
      },
      {
        id: "phone",
        label: t("common.phone"),
        sortable: true,
        className: "min-w-[140px]",
        render: (item) =>
          item.phone ? (
            <span className="whitespace-nowrap">{formatPhoneNumber(item.phone)}</span>
          ) : (
            "—"
          ),
        getSortValue: (item) => item.phone ?? "",
      },
      {
        id: "pesel",
        label: t("gabinet.patients.pesel"),
        sortable: true,
        render: (item) => item.pesel ?? "—",
        getSortValue: (item) => item.pesel ?? "",
      },
      {
        id: "dateOfBirth",
        label: t("gabinet.patients.dateOfBirth"),
        sortable: true,
        render: (item) => (item.dateOfBirth ? formatBirthDate(item.dateOfBirth) : "—"),
        getSortValue: (item) => item.dateOfBirth ?? "",
      },
      {
        id: "gender",
        label: t("gabinet.patients.gender"),
        sortable: true,
        render: (item) => item.gender ?? "—",
        getSortValue: (item) => item.gender ?? "",
      },
      {
        id: "referralSource",
        label: t("gabinet.patients.referralSource"),
        sortable: true,
        render: (item) => (item.referralSource ? displayReferralSource(item.referralSource, t) : "—"),
        getSortValue: (item) => (item.referralSource ? displayReferralSource(item.referralSource, t) : ""),
      },
      {
        id: "allergies",
        label: t("gabinet.patients.allergies"),
        sortable: true,
        render: (item) => item.allergies ?? "—",
        getSortValue: (item) => item.allergies ?? "",
      },
      {
        id: "bloodType",
        label: t("gabinet.patients.bloodType"),
        sortable: true,
        render: (item) => item.bloodType ?? "—",
        getSortValue: (item) => item.bloodType ?? "",
      },
      {
        id: "medicalNotes",
        label: t("gabinet.patients.medicalNotes"),
        sortable: true,
        render: (item) => plateJsonToText(item.medicalNotes ?? undefined).trim() || "—",
        getSortValue: (item) => plateJsonToText(item.medicalNotes ?? undefined).trim(),
      },
      {
        id: "createdAt",
        label: t("common.created"),
        sortable: true,
        render: (item) => new Date(item.createdAt).toLocaleDateString(),
        getSortValue: (item) => item.createdAt,
      },
    ],
    [t],
  );

  const { allColumns, defaultHidden } = useAllColumns(columns, filterableFields);
  const { hiddenColumnIds, toggleColumn, setHiddenColumns } = useColumnVisibility(defaultHidden, "gabinet-patients");

  const handleCreate = useCallback(
    async (formData: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      pesel?: string | null;
      dateOfBirth?: string | null;
      gender?: "male" | "female" | "other";
      address?: { street?: string; city?: string; postalCode?: string } | null;
      medicalNotes?: string | null;
      allergies?: string | null;
      bloodType?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
      referralSource?: string | null;
      tagIds?: Id<"tagDefinitions">[];
      categoryId?: Id<"categoryDefinitions">;
    }) => {
      setIsCreating(true);
      try {
        await createPatient({
          organizationId,
          ...formData,
        });
        setPanelOpen(false);
      } catch (e) {
        toast.error(
          formatActionError(e, t, {
            key: "gabinet.patients.errors.createFailed",
            defaultValue: "Nie udało się dodać klienta.",
          }),
        );
      } finally {
        setIsCreating(false);
      }
    },
    [createPatient, organizationId, t],
  );

  const handleBulkAction = useCallback(
    async (action: string, selectedRows: Patient[]) => {
      if (action === "delete") {
        for (const row of selectedRows) {
          await removePatient({ organizationId, patientId: row._id as Id<"gabinetPatients"> });
        }
      } else if (action === "merge") {
        if (selectedRows.length !== 2) {
          toast.error(
            t("gabinet.patients.merge.selectExactlyTwo", {
              defaultValue: "Aby scalić, zaznacz dokładnie dwóch klientów.",
            }),
          );
          return;
        }
        setMergeSourcePatient(selectedRows[0]);
        setMergePreselectedTargetId(selectedRows[1]._id);
      } else if (action === "edit") {
        const first = selectedRows[0];
        if (first) navigate({ to: `/dashboard/gabinet/patients/${first._id}` });
      }
    },
    [removePatient, organizationId, t, navigate],
  );

  const rowActions = useCallback(
    (row: Patient) => [
      {
        label: t("common.edit"),
        onClick: () =>
          navigate({ to: `/dashboard/gabinet/patients/${row._id}` }),
      },
      {
        label: t("gabinet.patients.merge.action", { defaultValue: "Scal z..." }),
        icon: <Users className="h-4 w-4" variant="stroke" />,
        onClick: () => setMergeSourcePatient(row),
      },
      {
        label: t("common.delete"),
        icon: <Trash2 className="h-4 w-4" variant="stroke" />,
        onClick: async () => {
          if (window.confirm(t("gabinet.patients.confirmDelete"))) {
            await removePatient({ organizationId, patientId: row._id as Id<"gabinetPatients"> });
          }
        },
      },
    ],
    [navigate, removePatient, organizationId, t],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("gabinet.patients.title")}
        description={t("gabinet.patients.description")}
        actions={
          <Button onClick={() => setPanelOpen(true)}>
            <Plus className="mr-2 h-4 w-4" variant="stroke" />
            {t("gabinet.patients.addPatient")}
          </Button>
        }
      />

      {duplicatePatientIds.size > 0 && nudgeFilter !== "duplicates" && (
        <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" variant="stroke" />
            {t("gabinet.patients.duplicatesBanner.count", {
              defaultValue:
                "{{count}} klientów ma duplikat e-maila lub telefonu.",
              count: duplicatePatientIds.size,
            })}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() =>
              navigate({
                to: "/dashboard/gabinet/patients",
                search: { nudge: "duplicates" },
              })
            }
          >
            <Users className="h-3.5 w-3.5" variant="stroke" />
            {t("gabinet.patients.duplicatesBanner.action", {
              defaultValue: "Przejrzyj duplikaty",
            })}
          </Button>
        </div>
      )}

      <DataListFilterBar
        views={views}
        activeViewId={activeViewId}
        onViewChange={onViewChange}
        onCreateView={onCreateView}
        onDeleteView={onDeleteView}
        filterableFields={filterableFields}
        createDialogOpen={savedViewsDialogOpen}
        onCreateDialogOpenChange={setSavedViewsDialogOpen}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder={t("gabinet.patients.searchPlaceholder")}
        dropdownActions={[
          {
            label: t("csv.export"),
            icon: <Download className="h-4 w-4" variant="stroke" />,
            onClick: handleExport,
          },
        ]}
        columnDefs={allColumns.map(c => ({ id: c.id, label: c.label ?? c.id }))}
        hiddenColumnIds={hiddenColumnIds}
        onToggleColumn={toggleColumn}
        onSetHiddenColumns={setHiddenColumns}
        onTagsManage={() => setTagsSlideoutOpen(true)}
        onCategoriesManage={() => setCategoriesSlideoutOpen(true)}
        onFiltersChange={setActiveFilters}
        leftExtras={<ChartsToggleButton open={chartsOpen} onToggle={toggleCharts} />}
      />

      {chartsOpen && (
        <MiniChartsRow
          leftChart={{
            title: t("gabinet.patients.byDay"),
            data: patientsByDay,
            chartType: "line",
            timeRange: leftTimeRange,
            onTimeRangeChange: setLeftTimeRange,
          }}
          rightChart={{
            title: t("gabinet.patients.bySource"),
            data: patientsBySource,
            chartType: "bar",
            timeRange: rightTimeRange,
            onTimeRangeChange: setRightTimeRange,
          }}
        />
      )}

      <CrmDataTable
        columns={allColumns}
        data={filteredPatients}
        isLoading={isLoading}
        hiddenColumnIds={hiddenColumnIds}
        sortDescriptor={sortDescriptor}
        onSortChange={setSortDescriptor}
        enableBulkSelect
        bulkActions={[
          { label: t("common.edit"), value: "edit" },
          {
            label: t("gabinet.patients.merge.bulkAction", { defaultValue: "Scal zaznaczonych" }),
            value: "merge",
          },
          {
            label: t("common.delete"),
            value: "delete",
            variant: "destructive",
          },
        ]}
        onBulkAction={handleBulkAction}
        rowActions={rowActions}
        emptyTitle={t("gabinet.patients.emptyTitle")}
        emptyDescription={t("gabinet.patients.emptyDescription")}
        onRowAction={(patientId) =>
          navigate({ to: `/dashboard/gabinet/patients/${patientId}` })
        }
      />

      <SidePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={t("gabinet.patients.createPatient")}
        description={t("gabinet.patients.createDescription")}
      >
        <PatientForm
          onSubmit={handleCreate}
          onCancel={() => setPanelOpen(false)}
          isSubmitting={isCreating}
          organizationId={organizationId}
          tagDefinitions={tags}
          categoryDefinitions={categories}
        />
      </SidePanel>

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
        entityType="gabinetPatient"
        categories={categories}
      />

      <MergePatientsDialog
        open={!!mergeSourcePatient}
        onOpenChange={(open) => {
          if (!open) {
            setMergeSourcePatient(null);
            setMergePreselectedTargetId(null);
          }
        }}
        organizationId={organizationId}
        sourcePatient={mergeSourcePatient}
        allPatients={patients}
        preselectedTargetId={mergePreselectedTargetId}
        onMerged={() => {
          void queryClient.invalidateQueries({
            queryKey: supabaseKeys.gabinetPatients.list(organizationId),
          });
        }}
      />
    </div>
  );
}
