import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useSupabaseCompaniesList } from "@/hooks/use-supabase-companies";
import { useSupabaseCompanyIdsLinkedToContact } from "@/hooks/use-supabase-relationships";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable, type CrmColumn, useColumnVisibility, useAllColumns } from "@/components/crm/enhanced-data-table";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import { MiniChartsRow } from "@/components/crm/mini-charts";
import { SidePanel } from "@/components/crm/side-panel";
import { CompanyForm } from "@/components/forms/company-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { companySizeOptions } from "@/lib/options";
import { Plus, Trash2, Upload, Download, X } from "@/lib/ez-icons";
import { useCsvExport } from "@/components/csv/csv-export-button";
import { CsvImportDialog } from "@/components/csv/csv-import-dialog";
import { Id } from "@cvx/_generated/dataModel";
import type { MappedCompany } from "@/lib/supabase/mappers/companies";
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { SavedView, TimeRange, FieldDef, FilterCondition } from "@/components/crm/types";
import type { MiniChartData } from "@/components/crm/mini-charts";
import { useSavedViews, applyFilterConditions } from "@/hooks/use-saved-views";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { useCustomFieldColumns } from "@/hooks/use-custom-field-columns";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { TagsManagerSlideout } from "@/components/categories-tags/tags-manager-slideout";
import { CategoriesManagerSlideout } from "@/components/categories-tags/categories-manager-slideout";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
import { Label } from "@/components/ui/label";

type CompanyNudgeFilter = "no-contacts" | "no-industry";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/companies/"
)({
  component: CompaniesIndex,
  validateSearch: (search: Record<string, unknown>): { nudge?: CompanyNudgeFilter } => {
    const nudge =
      search.nudge === "no-contacts" || search.nudge === "no-industry"
        ? (search.nudge as CompanyNudgeFilter)
        : undefined;
    return { nudge };
  },
});

type Company = MappedCompany;
type CompanyRow = Company & { __cfValues: Record<string, unknown> };

function CompaniesIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { nudge: nudgeFilter } = useSearch({ from: Route.id });
  const createCompany = useAction(api.companies.create);
  const removeCompany = useAction(api.companies.remove);
  const setCustomFieldValues = useAction(api.customFields.setValues);

  const [panelOpen, setPanelOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [relationshipsPanelOpen, setRelationshipsPanelOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const { handleExport } = useCsvExport(organizationId, "companies");
  const { tags } = useTagDefinitions(organizationId);
  const { categories } = useCategoryDefinitions(organizationId, "company");
  const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);
  const [categoriesSlideoutOpen, setCategoriesSlideoutOpen] = useState(false);
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>([]);
  const [categoryId, setCategoryId] = useState<Id<"categoryDefinitions"> | undefined>(undefined);

  // Sidebar action dispatches
  useSidebarDispatch("importCsv", () => setImportOpen(true));
  useSidebarDispatch("exportCsv", () => handleExport());
  useSidebarDispatch("manageTags", () => setTagsSlideoutOpen(true));
  useSidebarDispatch("manageCategories", () => setCategoriesSlideoutOpen(true));
  useSidebarDispatch("viewRelationships", () => setRelationshipsPanelOpen(true));
  const [activeFilters, setActiveFilters] = useState<FilterCondition[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [leftTimeRange, setLeftTimeRange] = useState<TimeRange>("last30days");
  const [rightTimeRange, setRightTimeRange] = useState<TimeRange>("all");

  const systemViews = useMemo((): SavedView[] => [
    { id: "all", name: t('companies.views.all'), isSystem: true, isDefault: true },
    { id: "my", name: t('companies.views.my'), isSystem: true, isDefault: false },
    { id: "recent", name: t('companies.views.recent'), isSystem: true, isDefault: false },
  ], [t]);

  const filterableFields = useMemo((): FieldDef[] => [
    { id: "name", label: t('companies.name'), type: "text" },
    { id: "domain", label: t('companies.domain'), type: "text" },
    { id: "industry", label: t('companies.industry'), type: "text" },
    {
      id: "size",
      label: t('companies.size'),
      type: "select",
      options: companySizeOptions(),
    },
    { id: "website", label: t('companies.website'), type: "text" },
    { id: "phone", label: t('common.phone'), type: "text" },
    { id: "createdAt", label: t('common.created'), type: "date" },
    { id: "tagIds", label: t('common.tags', { defaultValue: "Tagi" }), type: "multiSelect" as const, options: tags.map(tag => ({ label: tag.name, value: tag._id })) },
    { id: "categoryId", label: t('common.category', { defaultValue: "Kategoria" }), type: "select" as const, options: categories.map(cat => ({ label: cat.name, value: cat._id })) },
  ], [t, tags, categories]);

  const { data: companies = [], isLoading } = useSupabaseCompaniesList(organizationId);
  const { data: companyIdsLinkedToContact } = useSupabaseCompanyIdsLinkedToContact(
    organizationId,
    { enabled: nudgeFilter === "no-contacts" },
  );

  const companyIds = useMemo(() => companies.map((c) => c._id), [companies]);

  const { definitions: cfDefs, columns: cfColumns, mergeCustomFieldValues } =
    useCustomFieldColumns<Company>({ organizationId, entityType: "company", entityIds: companyIds });

  const {
    views,
    activeViewId,
    onViewChange,
    onCreateView,
    onDeleteView,
    applyFilters,
  } = useSavedViews({
    organizationId,
    entityType: "company",
    systemViews: systemViews,
    defaultColumnVisibility: {},
  });

  const filteredCompanies = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    let data: Company[];
    switch (activeViewId) {
      case "my":
        data = companies;
        break;
      case "recent":
        data = companies.filter((c) => c.createdAt >= sevenDaysAgo);
        break;
      default:
        data = companies;
    }
    if (nudgeFilter === "no-contacts" && companyIdsLinkedToContact) {
      data = data.filter((c) => !companyIdsLinkedToContact.has(c._id));
    }
    if (nudgeFilter === "no-industry") {
      data = data.filter((c) => !c.industry);
    }
    data = applyFilters(data);
    data = applyFilterConditions(data, activeFilters);
    const q = searchValue.trim().toLowerCase();
    if (q) {
      data = data.filter((c) => c.name.toLowerCase().includes(q));
    }
    return data;
  }, [companies, activeViewId, applyFilters, activeFilters, searchValue, nudgeFilter, companyIdsLinkedToContact]);

  const tableData = mergeCustomFieldValues(filteredCompanies);

  const companiesByDay = useMemo<MiniChartData[]>(() => {
    const dayMap = new Map<string, number>();
    for (const c of companies) {
      const day = new Date(c.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }
    return Array.from(dayMap.entries())
      .map(([label, value]) => ({ label, value }))
      .slice(-14);
  }, [companies]);

  const companiesByIndustry = useMemo<MiniChartData[]>(() => {
    const indMap = new Map<string, number>();
    for (const c of companies) {
      const ind = c.industry ?? "Unknown";
      indMap.set(ind, (indMap.get(ind) ?? 0) + 1);
    }
    return Array.from(indMap.entries()).map(([label, value]) => ({
      label,
      value,
    }));
  }, [companies]);

  // --- CrmColumn definitions ---

  const columns = useMemo((): CrmColumn<CompanyRow>[] => [
    {
      id: "name",
      label: t('common.name'),
      sortable: true,
      isRowHeader: true,
      render: (item) => (
        <div>
          <Link
            to="/dashboard/companies/$companyId"
            params={{ companyId: item._id }}
            className="font-medium text-fg-primary hover:text-brand-secondary"
          >
            {item.name}
          </Link>
          {item.domain && (
            <p className="text-xs text-muted-foreground">{item.domain}</p>
          )}
        </div>
      ),
      getSortValue: (item) => item.name,
    },
    {
      id: "domain",
      label: t('companies.domain'),
      render: (item) => item.domain ?? "—",
    },
    {
      id: "phone",
      label: t('common.phone'),
      render: (item) => item.phone ?? "—",
    },
    {
      id: "industry",
      label: t('companies.industry'),
      sortable: true,
      render: (item) => item.industry ?? "—",
      getSortValue: (item) => item.industry ?? "",
    },
    {
      id: "size",
      label: t('companies.size'),
      render: (item) => item.size ?? "—",
    },
    {
      id: "website",
      label: t('companies.website'),
      render: (item) => item.website ?? "—",
    },
    {
      id: "address",
      label: t('companies.address'),
      render: (item) => {
        const a = item.address;
        if (!a) return "—";
        const parts = [a.street, a.city, a.state, a.zip, a.country].filter(Boolean).join(", ");
        return parts || "—";
      },
    },
    {
      id: "tags",
      label: t('common.tags'),
      render: (item) => {
        const tags = item.tags;
        if (!tags || tags.length === 0) return "—";
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
            ))}
          </div>
        );
      },
    },
    {
      id: "notes",
      label: t('common.notes'),
      render: (item) => item.notes ?? "—",
    },
    {
      id: "createdAt",
      label: t('common.created'),
      sortable: true,
      render: (item) => new Date(item.createdAt).toLocaleDateString(),
      getSortValue: (item) => item.createdAt,
    },
    {
      id: "updatedAt",
      label: t('common.updated'),
      sortable: true,
      render: (item) => new Date(item.updatedAt).toLocaleDateString(),
      getSortValue: (item) => item.updatedAt,
    },
  ], [t]);

  const mergedColumns = useMemo(() => [...columns, ...cfColumns], [columns, cfColumns]);
  const { allColumns, defaultHidden } = useAllColumns(mergedColumns, filterableFields);
  const { hiddenColumnIds, toggleColumn, setHiddenColumns } = useColumnVisibility(defaultHidden, "companies");

  const handleCreate = useCallback(
    async (
      formData: {
        name: string;
        domain?: string;
        industry?: string;
        size?: string;
        website?: string;
        phone?: string;
        address?: {
          street?: string;
          city?: string;
          state?: string;
          zip?: string;
          country?: string;
        };
        notes?: string;
      },
      customFieldRecord: Record<string, unknown>
    ) => {
      setIsCreating(true);
      try {
        const companyId = await createCompany({
          organizationId,
          name: formData.name,
          domain: formData.domain,
          industry: formData.industry,
          size: formData.size,
          website: formData.website,
          phone: formData.phone,
          notes: formData.notes,
          tagIds: tagIds.length > 0 ? tagIds : undefined,
          categoryId,
        });
        if (cfDefs && Object.keys(customFieldRecord).length > 0) {
          const fields = cfDefs
            .filter((d) => customFieldRecord[d.fieldKey] !== undefined && customFieldRecord[d.fieldKey] !== "")
            .map((d) => ({ fieldDefinitionId: d._id as any, value: customFieldRecord[d.fieldKey] }));
          if (fields.length > 0) {
            await setCustomFieldValues({
              organizationId,
              entityType: "company" as any,
              entityId: companyId as string,
              fields,
            });
          }
        }
        setPanelOpen(false);
        setTagIds([]);
        setCategoryId(undefined);
      } finally {
        setIsCreating(false);
      }
    },
    [createCompany, organizationId, cfDefs, setCustomFieldValues, tagIds, categoryId]
  );

  const handleBulkAction = useCallback(
    async (action: string, selectedRows: CompanyRow[]) => {
      if (action === "delete") {
        for (const row of selectedRows) {
          await removeCompany({ organizationId, companyId: row._id });
        }
      }
    },
    [removeCompany, organizationId]
  );

  const rowActions = useCallback(
    (row: CompanyRow) => [
      {
        label: t('common.edit'),
        onClick: () => navigate({ to: `/dashboard/companies/${row._id}` }),
      },
      {
        label: t('common.delete'),
        icon: <Trash2 className="h-4 w-4" variant="stroke" />,
        onClick: async () => {
          if (window.confirm(t('companies.confirmDelete'))) {
            await removeCompany({ organizationId, companyId: row._id });
          }
        },
      },
    ],
    [navigate, removeCompany, organizationId, t]
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('companies.title')}
        description={t('companies.description')}
        actions={
          <Button onClick={() => setPanelOpen(true)}>
            <Plus className="mr-2 h-4 w-4" variant="stroke" />
            {t('companies.addCompany')}
          </Button>
        }
      />

      {nudgeFilter && (
        <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <span>
            {nudgeFilter === "no-contacts"
              ? t("companies.nudgeFilter.noContacts", {
                  defaultValue: "Pokazywane są firmy bez powiązanych kontaktów.",
                })
              : t("companies.nudgeFilter.noIndustry", {
                  defaultValue: "Pokazywane są firmy bez uzupełnionej branży.",
                })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() =>
              navigate({
                to: "/dashboard/companies",
                search: { nudge: undefined },
              })
            }
          >
            <X className="h-3.5 w-3.5" variant="stroke" />
            {t("common.clearFilters")}
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
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder={t('companies.searchPlaceholder')}
        onFiltersChange={setActiveFilters}
        onTagsManage={() => setTagsSlideoutOpen(true)}
        onCategoriesManage={() => setCategoriesSlideoutOpen(true)}
        dropdownActions={[
          { label: t("csv.export"), icon: <Download className="h-4 w-4" variant="stroke" />, onClick: handleExport },
          { label: t("csv.import"), icon: <Upload className="h-4 w-4" variant="stroke" />, onClick: () => setImportOpen(true) },
        ]}
        columnDefs={allColumns.map(c => ({ id: c.id, label: c.label ?? c.id }))}
        hiddenColumnIds={hiddenColumnIds}
        onToggleColumn={toggleColumn}
        onSetHiddenColumns={setHiddenColumns}
      />

      <MiniChartsRow
        leftChart={{
          title: t('companies.byDay'),
          data: companiesByDay,
          chartType: "line",
          timeRange: leftTimeRange,
          onTimeRangeChange: setLeftTimeRange,
        }}
        rightChart={{
          title: t('companies.byIndustry'),
          data: companiesByIndustry,
          chartType: "bar",
          timeRange: rightTimeRange,
          onTimeRangeChange: setRightTimeRange,
        }}
      />

      <CrmDataTable
        columns={allColumns}
        data={tableData}
        isLoading={isLoading}
        hiddenColumnIds={hiddenColumnIds}
        enableBulkSelect
        bulkActions={[
          { label: t('common.delete'), value: "delete", variant: "destructive" },
        ]}
        onBulkAction={handleBulkAction}
        rowActions={rowActions}
        onRowAction={(id) => navigate({ to: '/dashboard/companies/$companyId', params: { companyId: id } })}
        emptyTitle={t('companies.emptyTitle')}
        emptyDescription={t('companies.emptyDescription')}
      />

      <CsvImportDialog
        organizationId={organizationId}
        entityType="companies"
        open={importOpen}
        onOpenChange={setImportOpen}
      />

      <SidePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={t('companies.createCompany')}
        description={t('companies.createDescription')}
      >
        <CompanyForm
          onSubmit={handleCreate}
          onCancel={() => setPanelOpen(false)}
          isSubmitting={isCreating}
          customFieldDefinitions={cfDefs}
          extraFields={
            <>
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
                  entityType="company"
                />
              </div>
            </>
          }
        />
      </SidePanel>

      <SidePanel
        open={relationshipsPanelOpen}
        onOpenChange={setRelationshipsPanelOpen}
        title={t('nav.actions.viewRelationships')}
        description={t('companies.relationshipsPanel.description', {
          defaultValue:
            "Wybierz firmę, aby zobaczyć i zarządzać jej powiązaniami z kontaktami i leadami.",
        })}
      >
        {filteredCompanies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('companies.relationshipsPanel.empty', {
              defaultValue: "Brak firm w bieżącym widoku.",
            })}
          </p>
        ) : (
          <ul className="space-y-1">
            {filteredCompanies.map((company) => (
              <li key={company._id}>
                <button
                  type="button"
                  className="w-full rounded-md border border-transparent px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    setRelationshipsPanelOpen(false);
                    navigate({
                      to: '/dashboard/companies/$companyId',
                      params: { companyId: company._id },
                    });
                  }}
                >
                  <div className="font-medium text-fg-primary">{company.name}</div>
                  {company.domain && (
                    <div className="text-xs text-muted-foreground">{company.domain}</div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
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
        entityType="company"
        categories={categories}
      />
    </div>
  );
}
