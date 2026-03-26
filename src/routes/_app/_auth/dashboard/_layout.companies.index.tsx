import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
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
import { Plus, Trash2, Upload, Download } from "@/lib/ez-icons";
import { useCsvExport } from "@/components/csv/csv-export-button";
import { CsvImportDialog } from "@/components/csv/csv-import-dialog";
import { Doc } from "@cvx/_generated/dataModel";
import { useState, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { SavedView, TimeRange, FieldDef } from "@/components/crm/types";
import type { MiniChartData } from "@/components/crm/mini-charts";
import { useSavedViews } from "@/hooks/use-saved-views";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { useCustomFieldColumns } from "@/hooks/use-custom-field-columns";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/companies/"
)({
  component: CompaniesIndex,
});

type Company = Doc<"companies">;
type CompanyRow = Company & { __cfValues: Record<string, unknown> };

function CompaniesIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const createCompany = useMutation(api.companies.create);
  const removeCompany = useMutation(api.companies.remove);
  const setCustomFieldValues = useMutation(api.customFields.setValues);

  const toolbarRef = useRef<React.ReactNode>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const { handleExport } = useCsvExport(organizationId, "companies");

  // Sidebar action dispatches
  useSidebarDispatch("importCsv", () => setImportOpen(true));
  useSidebarDispatch("exportCsv", () => handleExport());
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
  ], [t]);

  const { data, isLoading } = useQuery(
    convexQuery(api.companies.list, {
      organizationId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  );

  const companies = data?.page ?? [];

  const companyIds = useMemo(() => companies.map((c) => c._id as string), [companies]);

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
    data = applyFilters(data);
    const q = searchValue.trim().toLowerCase();
    if (q) {
      data = data.filter((c) => c.name.toLowerCase().includes(q));
    }
    return data;
  }, [companies, activeViewId, applyFilters, searchValue]);

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
  const { hiddenColumnIds, toggleColumn } = useColumnVisibility(defaultHidden);

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
      } finally {
        setIsCreating(false);
      }
    },
    [createCompany, organizationId, cfDefs, setCustomFieldValues]
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
        dropdownActions={[
          { label: t("csv.export"), icon: <Download className="h-4 w-4" variant="stroke" />, onClick: handleExport },
          { label: t("csv.import"), icon: <Upload className="h-4 w-4" variant="stroke" />, onClick: () => setImportOpen(true) },
        ]}
        columnDefs={allColumns.map(c => ({ id: c.id, label: c.label ?? c.id }))}
        hiddenColumnIds={hiddenColumnIds}
        onToggleColumn={toggleColumn}
        renderToolbar={(toolbar) => { toolbarRef.current = toolbar; return null; }}
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
        toolbar={toolbarRef.current}
        enableBulkSelect
        bulkActions={[
          { label: t('common.delete'), value: "delete", variant: "destructive" },
        ]}
        onBulkAction={handleBulkAction}
        rowActions={rowActions}
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
        />
      </SidePanel>
    </div>
  );
}
