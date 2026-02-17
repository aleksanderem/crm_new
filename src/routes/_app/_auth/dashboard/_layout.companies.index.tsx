import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable } from "@/components/crm/enhanced-data-table";
import { SavedViewsTabs } from "@/components/crm/saved-views-tabs";
import { MiniChartsRow } from "@/components/crm/mini-charts";
import { SidePanel } from "@/components/crm/side-panel";
import { CompanyForm } from "@/components/forms/company-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Plus, Building2, Trash2, Upload } from "@/lib/ez-icons";
import { CsvExportButton } from "@/components/csv/csv-export-button";
import { CsvImportDialog } from "@/components/csv/csv-import-dialog";
import { QuickActionBar } from "@/components/crm/quick-action-bar";
import { ColumnDef } from "@tanstack/react-table";
import { Doc } from "@cvx/_generated/dataModel";
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/layout/empty-state";
import type { SavedView, TimeRange, FieldDef } from "@/components/crm/types";
import type { MiniChartData } from "@/components/crm/mini-charts";
import { useSavedViews } from "@/hooks/use-saved-views";
import { useCustomFieldColumns } from "@/hooks/use-custom-field-columns";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/companies/"
)({
  component: CompaniesIndex,
});

type Company = Doc<"companies">;

const DEFAULT_HIDDEN: Record<string, boolean> = {
  domain: false,
  website: false,
  address: false,
  tags: false,
  notes: false,
  createdBy: false,
  updatedAt: false,
};

function CompaniesIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const createCompany = useMutation(api.companies.create);
  const removeCompany = useMutation(api.companies.remove);
  const setCustomFieldValues = useMutation(api.customFields.setValues);

  const [panelOpen, setPanelOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [leftTimeRange, setLeftTimeRange] = useState<TimeRange>("last30days");
  const [rightTimeRange, setRightTimeRange] = useState<TimeRange>("all");

  const systemViews = useMemo((): SavedView[] => [
    { id: "all", name: t('companies.views.all'), isSystem: true, isDefault: true },
    { id: "my", name: t('companies.views.my'), isSystem: true, isDefault: false },
    { id: "recent", name: t('companies.views.recent'), isSystem: true, isDefault: false },
  ], [t]);

  const filterableFields = useMemo((): FieldDef[] => [
    { id: "industry", label: t('companies.industry'), type: "text" },
    {
      id: "size",
      label: t('companies.size'),
      type: "select",
      options: [
        { label: "1-10", value: "1-10" },
        { label: "11-50", value: "11-50" },
        { label: "51-200", value: "51-200" },
        { label: "201-500", value: "201-500" },
        { label: "501-1000", value: "501-1000" },
        { label: "1000+", value: "1000+" },
      ],
    },
    { id: "createdAt", label: t('common.created'), type: "date" },
  ], [t]);

  const { data, isLoading } = useQuery(
    convexQuery(api.companies.list, {
      organizationId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  );

  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );

  const companies = data?.page ?? [];

  const companyIds = useMemo(() => companies.map((c) => c._id as string), [companies]);

  const { definitions: cfDefs, columns: cfColumns, defaultColumnVisibility: cfDefaultVis, mergeCustomFieldValues } =
    useCustomFieldColumns<Company>({ organizationId, entityType: "company", entityIds: companyIds });

  const mergedDefaultVis = useMemo(() => ({ ...DEFAULT_HIDDEN, ...cfDefaultVis }), [cfDefaultVis]);

  const {
    views,
    activeViewId,
    onViewChange,
    onCreateView,
    onUpdateView,
    onDeleteView,
    columnVisibility,
    sorting,
    setColumnVisibility,
    setSorting,
    applyFilters,
  } = useSavedViews({
    organizationId,
    entityType: "company",
    systemViews: systemViews,
    defaultColumnVisibility: mergedDefaultVis,
  });

  const userLookup = useMemo(() => {
    const map = new Map<string, string>();
    if (members) {
      for (const m of members) {
        if (m.user) map.set(m.user._id, m.user.name ?? m.user.email ?? "Unknown");
      }
    }
    return map;
  }, [members]);

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
    return applyFilters(data);
  }, [companies, activeViewId, applyFilters]);

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

  const industryOptions = useMemo(() => {
    const industries = new Set<string>();
    for (const c of companies) {
      if (c.industry) industries.add(c.industry);
    }
    return Array.from(industries).map((i) => ({ label: i, value: i }));
  }, [companies]);

  const sizeOptions = useMemo(() => {
    const sizes = new Set<string>();
    for (const c of companies) {
      if (c.size) sizes.add(c.size);
    }
    return Array.from(sizes).map((s) => ({ label: s, value: s }));
  }, [companies]);

  const columns: ColumnDef<Company>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('common.name')} />,
      cell: ({ row }) => (
        <div>
          <span className="font-medium">{row.original.name}</span>
          {row.original.domain && (
            <p className="text-xs text-muted-foreground">{row.original.domain}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "domain",
      header: t('companies.domain'),
      cell: ({ getValue }) => (getValue() as string) ?? "—",
    },
    {
      accessorKey: "phone",
      header: t('common.phone'),
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{(getValue() as string) ?? "—"}</span>
      ),
    },
    {
      accessorKey: "industry",
      header: t('companies.industry'),
      cell: ({ getValue }) => {
        const v = getValue() as string | undefined;
        return v ? <Badge variant="outline">{v}</Badge> : "—";
      },
      filterFn: (row, id, value) => (value as string[]).includes(row.getValue(id)),
    },
    {
      accessorKey: "size",
      header: t('companies.size'),
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{(getValue() as string) ?? "—"}</span>
      ),
      filterFn: (row, id, value) => (value as string[]).includes(row.getValue(id)),
    },
    {
      accessorKey: "website",
      header: t('companies.website'),
      cell: ({ getValue }) => {
        const v = getValue() as string | undefined;
        if (!v) return "—";
        return (
          <a
            href={v.startsWith("http") ? v : `https://${v}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {v}
          </a>
        );
      },
    },
    {
      id: "address",
      header: t('companies.address'),
      accessorFn: (row) => {
        const a = row.address;
        if (!a) return "";
        return [a.street, a.city, a.state, a.zip, a.country].filter(Boolean).join(", ");
      },
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return v || "—";
      },
    },
    {
      id: "tags",
      header: t('common.tags'),
      accessorFn: (row) => (row.tags ?? []).join(", "),
      cell: ({ row }) => {
        const tags = row.original.tags;
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
      accessorKey: "notes",
      header: t('common.notes'),
      cell: ({ getValue }) => {
        const v = getValue() as string | undefined;
        if (!v) return "—";
        return <span className="max-w-[200px] truncate block">{v}</span>;
      },
    },
    {
      id: "createdBy",
      header: t('common.createdBy'),
      accessorFn: (row) => userLookup.get(row.createdBy) ?? "",
      cell: ({ row }) => userLookup.get(row.original.createdBy) ?? "—",
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('common.created')} />,
      cell: ({ getValue }) => new Date(getValue() as number).toLocaleDateString(),
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('common.updated')} />,
      cell: ({ getValue }) => new Date(getValue() as number).toLocaleDateString(),
    },
  ];

  const allColumns = useMemo(() => [...columns, ...cfColumns], [columns, cfColumns]);

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
    async (action: string, selectedRows: Company[]) => {
      if (action === "delete") {
        for (const row of selectedRows) {
          await removeCompany({ organizationId, companyId: row._id });
        }
      }
    },
    [removeCompany, organizationId]
  );

  const rowActions = useCallback(
    (row: Company) => [
      {
        label: t('common.edit'),
        onClick: () => navigate({ to: `/dashboard/companies/${row._id}` }),
      },
      {
        label: t('common.delete'),
        icon: <Trash2 className="h-3.5 w-3.5" />,
        onClick: async () => {
          if (window.confirm(t('companies.confirmDelete'))) {
            await removeCompany({ organizationId, companyId: row._id });
          }
        },
      },
    ],
    [navigate, removeCompany, organizationId]
  );

  const filterableColumns = useMemo(() => {
    const cols: { id: string; title: string; options: { label: string; value: string }[] }[] = [];
    if (industryOptions.length > 0) {
      cols.push({ id: "industry", title: t('companies.industry'), options: industryOptions });
    }
    if (sizeOptions.length > 0) {
      cols.push({ id: "size", title: t('companies.size'), options: sizeOptions });
    }
    return cols;
  }, [industryOptions, sizeOptions]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('companies.title')}
        description={t('companies.description')}
        actions={
          <Button onClick={() => setPanelOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('companies.addCompany')}
          </Button>
        }
      />

      <SavedViewsTabs
        views={views}
        activeViewId={activeViewId}
        onViewChange={onViewChange}
        onCreateView={onCreateView}
        onUpdateView={onUpdateView}
        onDeleteView={onDeleteView}
        filterableFields={filterableFields}
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

      <QuickActionBar
        actions={[
          {
            label: t('quickActions.newCompany'),
            icon: <Plus className="mr-1.5 h-3.5 w-3.5" />,
            onClick: () => setPanelOpen(true),
            feature: "companies",
            action: "create",
          },
          {
            label: t('quickActions.importCsv'),
            icon: <Upload className="mr-1.5 h-3.5 w-3.5" />,
            onClick: () => setImportOpen(true),
            feature: "companies",
            action: "create",
          },
        ]}
        extra={<CsvExportButton organizationId={organizationId} entityType="companies" />}
      />

      {!isLoading && filteredCompanies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t('companies.emptyTitle')}
          description={t('companies.emptyDescription')}
          action={
            <Button onClick={() => setPanelOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('companies.addCompany')}
            </Button>
          }
        />
      ) : (
        <CrmDataTable
          columns={allColumns}
          data={tableData}
          stickyFirstColumn
          searchKey="name"
          searchPlaceholder={t('companies.searchPlaceholder')}
          isLoading={isLoading}
          enableBulkSelect
          bulkActions={[
            { label: t('common.delete'), value: "delete", variant: "destructive" },
          ]}
          onBulkAction={handleBulkAction}
          rowActions={rowActions}
          onRowClick={(row) => navigate({ to: `/dashboard/companies/${row._id}` })}
          totalCount={filteredCompanies.length}
          filterableColumns={filterableColumns}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          sorting={sorting}
          onSortingChange={setSorting}
          toolbarActions={
            <div className="flex items-center gap-2">
              <CsvExportButton organizationId={organizationId} entityType="companies" />
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                {t("csv.import")}
              </Button>
            </div>
          }
        />
      )}

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
