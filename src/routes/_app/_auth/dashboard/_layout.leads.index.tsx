import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { CrmDataTable } from "@/components/crm/enhanced-data-table";
import { SavedViewsTabs } from "@/components/crm/saved-views-tabs";
import { MiniChartsRow } from "@/components/crm/mini-charts";
import { SidePanel } from "@/components/crm/side-panel";
import { LeadForm } from "@/components/forms/lead-form";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  TrendingUp,
  TableIcon,
  KanbanIcon,
  Trophy,
  XCircle,
  Trash2,
  Upload,
} from "lucide-react";
import { CsvExportButton } from "@/components/csv/csv-export-button";
import { CsvImportDialog } from "@/components/csv/csv-import-dialog";
import { ColumnDef } from "@tanstack/react-table";
import { Doc, Id } from "@cvx/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { SavedView, TimeRange, FieldDef } from "@/components/crm/types";
import type { MiniChartData } from "@/components/crm/mini-charts";
import { useSavedViews } from "@/hooks/use-saved-views";
import { useCustomFieldColumns } from "@/hooks/use-custom-field-columns";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/leads/"
)({
  component: LeadsIndex,
});

type Lead = Doc<"leads">;

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
  archived: "bg-gray-100 text-gray-700",
};

const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-green-100 text-green-700",
};

const stageColors: Record<string, string> = {
  "New": "bg-sky-100 text-sky-700",
  "Qualified": "bg-violet-100 text-violet-700",
  "Proposal": "bg-amber-100 text-amber-700",
  "Negotiation": "bg-orange-100 text-orange-700",
  "Closed Won": "bg-green-100 text-green-700",
  "Closed Lost": "bg-red-100 text-red-700",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

const DEFAULT_HIDDEN: Record<string, boolean> = {
  currency: false,
  source: false,
  company: false,
  assignedTo: false,
  tags: false,
  notes: false,
  wonAt: false,
  lostAt: false,
  lostReason: false,
  createdBy: false,
  updatedAt: false,
};

function LeadsIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const updateLead = useMutation(api.leads.update);
  const removeLead = useMutation(api.leads.remove);
  const createLead = useMutation(api.leads.create);

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [chartTimeRange, setChartTimeRange] = useState<TimeRange>("last30days");

  const systemViews = useMemo((): SavedView[] => [
    { id: "all", name: t('deals.views.all'), isSystem: true, isDefault: true },
    { id: "my-deals", name: t('deals.views.myDeals'), isSystem: true, isDefault: false },
    { id: "recently-assigned", name: t('deals.views.recentlyAssigned'), isSystem: true, isDefault: false },
    { id: "this-month", name: t('deals.views.thisMonth'), isSystem: true, isDefault: false },
    { id: "won", name: t('deals.views.won'), isSystem: true, isDefault: false },
  ], [t]);

  const filterableFields = useMemo((): FieldDef[] => [
    {
      id: "status",
      label: t('common.status'),
      type: "select",
      options: [
        { label: t('deals.filters.open'), value: "open" },
        { label: t('deals.filters.won'), value: "won" },
        { label: t('deals.filters.lost'), value: "lost" },
      ],
    },
    {
      id: "priority",
      label: t('common.priority'),
      type: "select",
      options: [
        { label: t('deals.priority.high'), value: "high" },
        { label: t('deals.priority.medium'), value: "medium" },
        { label: t('deals.priority.low'), value: "low" },
      ],
    },
    { id: "source", label: t('common.source'), type: "text" },
    { id: "value", label: t('deals.dealValue'), type: "number" },
    { id: "expectedCloseDate", label: t('deals.expectedClose'), type: "date" },
    { id: "createdAt", label: t('common.created'), type: "date" },
  ], [t]);

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
    entityType: "lead",
    systemViews: systemViews,
    defaultColumnVisibility: DEFAULT_HIDDEN,
  });

  const { data: pipelines } = useQuery(
    convexQuery(api.pipelines.list, { organizationId })
  );

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const activePipeline =
    pipelines?.find((p) => p._id === selectedPipelineId) ??
    pipelines?.find((p) => p.isDefault) ??
    pipelines?.[0];

  const firstPipelineId = pipelines?.[0]?._id;
  const { data: stages } = useQuery({
    ...convexQuery(api.pipelines.getStages, {
      organizationId,
      pipelineId: firstPipelineId ?? ("" as Id<"pipelines">),
    }),
    enabled: !!firstPipelineId,
  });

  const { data, isLoading } = useQuery(
    convexQuery(api.leads.list, {
      organizationId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  );

  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );

  const { data: companiesData } = useQuery(
    convexQuery(api.companies.list, {
      organizationId,
      paginationOpts: { numItems: 500, cursor: null },
    })
  );

  const userLookup = useMemo(() => {
    const map = new Map<string, string>();
    if (members) {
      for (const m of members) {
        if (m.user) map.set(m.user._id, m.user.name ?? m.user.email ?? "Unknown");
      }
    }
    return map;
  }, [members]);

  const companyLookup = useMemo(() => {
    const map = new Map<string, string>();
    if (companiesData?.page) {
      for (const c of companiesData.page) {
        map.set(c._id, c.name);
      }
    }
    return map;
  }, [companiesData]);

  const leads = data?.page ?? [];

  const filteredLeads = useMemo(() => {
    let data = leads;
    switch (activeViewId) {
      case "this-month": {
        const start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        data = data.filter((l) => l.createdAt >= start.getTime());
        break;
      }
      case "won":
        data = data.filter((l) => l.status === "won");
        break;
    }
    return applyFilters(data);
  }, [leads, activeViewId, applyFilters]);

  const leadIds = useMemo(() => filteredLeads.map((l) => l._id as string), [filteredLeads]);
  const {
    definitions: cfDefs,
    columns: cfColumns,
    defaultColumnVisibility: cfDefaultVis,
    mergeCustomFieldValues,
  } = useCustomFieldColumns<Lead>({ organizationId, entityType: "lead", entityIds: leadIds });
  const tableData = mergeCustomFieldValues(filteredLeads);

  const stageChartData: MiniChartData[] = useMemo(() => {
    if (!stages) return [];
    const countMap = new Map<string, number>();
    for (const s of stages) countMap.set(s.name, 0);
    for (const l of leads) {
      if (l.pipelineStageId) {
        const stage = stages.find((s) => s._id === l.pipelineStageId);
        if (stage) countMap.set(stage.name, (countMap.get(stage.name) ?? 0) + 1);
      }
    }
    return Array.from(countMap.entries()).map(([label, value]) => ({ label, value }));
  }, [leads, stages]);

  const wonChartData: MiniChartData[] = useMemo(() => {
    const wonLeads = leads.filter((l) => l.status === "won" && l.wonAt);
    const dayMap = new Map<string, number>();
    for (const l of wonLeads) {
      const day = new Date(l.wonAt!).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }
    return Array.from(dayMap.entries())
      .map(([label, value]) => ({ label, value }))
      .slice(-7);
  }, [leads]);

  const columns: ColumnDef<Lead>[] = [
    {
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('deals.dealName')} />,
      cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span>,
    },
    {
      id: "stage",
      header: t('deals.stage'),
      cell: ({ row }) => {
        const stageId = row.original.pipelineStageId;
        if (!stageId || !stages) return "—";
        const stage = stages.find((s) => s._id === stageId);
        if (!stage) return "—";
        return (
          <Badge variant="secondary" className={cn("text-xs", stageColors[stage.name] ?? "bg-gray-100 text-gray-700")}>
            {stage.name}
          </Badge>
        );
      },
    },
    {
      accessorKey: "value",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('common.amount')} />,
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v ? formatCurrency(v) : "—";
      },
    },
    {
      accessorKey: "currency",
      header: t('deals.currency'),
      cell: ({ getValue }) => (getValue() as string) ?? "—",
    },
    {
      accessorKey: "expectedCloseDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('deals.expectedClose')} />,
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v ? new Date(v).toLocaleDateString() : "—";
      },
    },
    {
      accessorKey: "status",
      header: t('common.status'),
      cell: ({ getValue }) => {
        const status = getValue() as string;
        return (
          <Badge variant="secondary" className={cn("capitalize", statusColors[status])}>
            {status}
          </Badge>
        );
      },
      filterFn: (row, id, value) => (value as string[]).includes(row.getValue(id)),
    },
    {
      accessorKey: "priority",
      header: t('common.priority'),
      cell: ({ getValue }) => {
        const p = getValue() as string | undefined;
        if (!p) return "—";
        return (
          <Badge variant="secondary" className={cn("capitalize", priorityColors[p])}>
            {p}
          </Badge>
        );
      },
      filterFn: (row, id, value) => (value as string[]).includes(row.getValue(id)),
    },
    {
      accessorKey: "source",
      header: t('common.source'),
      cell: ({ getValue }) => (getValue() as string) ?? "—",
      filterFn: (row, id, value) => (value as string[]).includes(row.getValue(id)),
    },
    {
      id: "company",
      header: t('deals.company'),
      accessorFn: (row) => row.companyId ? companyLookup.get(row.companyId) ?? "" : "",
      cell: ({ row }) => {
        const companyId = row.original.companyId;
        if (!companyId) return "—";
        return companyLookup.get(companyId) ?? "—";
      },
    },
    {
      id: "assignedTo",
      header: t('deals.assignedTo'),
      accessorFn: (row) => row.assignedTo ? userLookup.get(row.assignedTo) ?? "" : "",
      cell: ({ row }) => {
        const userId = row.original.assignedTo;
        if (!userId) return "—";
        return userLookup.get(userId) ?? "—";
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
      accessorKey: "wonAt",
      header: t('deals.wonDate'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v ? new Date(v).toLocaleDateString() : "—";
      },
    },
    {
      accessorKey: "lostAt",
      header: t('deals.lostDate'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v ? new Date(v).toLocaleDateString() : "—";
      },
    },
    {
      accessorKey: "lostReason",
      header: t('deals.lostReason'),
      cell: ({ getValue }) => (getValue() as string) ?? "—",
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
  const effectiveColumnVisibility = useMemo(
    () => ({ ...cfDefaultVis, ...columnVisibility }),
    [cfDefaultVis, columnVisibility]
  );

  const handleMarkWon = async (lead: Lead) => {
    await updateLead({ organizationId, leadId: lead._id, status: "won" });
  };

  const handleMarkLost = async (lead: Lead) => {
    await updateLead({ organizationId, leadId: lead._id, status: "lost" });
  };

  const handleDelete = async (lead: Lead) => {
    await removeLead({ organizationId, leadId: lead._id });
  };

  const handleBulkAction = useCallback(
    async (action: string, selectedRows: Lead[]) => {
      switch (action) {
        case "markWon":
          for (const row of selectedRows) {
            await updateLead({ organizationId, leadId: row._id, status: "won" });
          }
          break;
        case "markLost":
          for (const row of selectedRows) {
            await updateLead({ organizationId, leadId: row._id, status: "lost" });
          }
          break;
        case "delete":
          for (const row of selectedRows) {
            await removeLead({ organizationId, leadId: row._id });
          }
          break;
      }
    },
    [updateLead, removeLead, organizationId]
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('deals.title')}
        description={t('deals.description')}
        actions={
          <div className="flex items-center gap-2">
            {pipelines && pipelines.length > 0 && (
              <select
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
                value={activePipeline?._id ?? ""}
                onChange={(e) => setSelectedPipelineId(e.target.value)}
              >
                {pipelines.map((p) => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>
            )}
            <div className="flex rounded-md border">
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-r-none bg-accent">
                <TableIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-l-none"
                onClick={() => navigate({ to: "/dashboard/pipelines" })}
              >
                <KanbanIcon className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('deals.addDeal')}
            </Button>
          </div>
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
          title: t('deals.byStage'),
          data: stageChartData,
          chartType: "bar",
          timeRange: chartTimeRange,
          onTimeRangeChange: setChartTimeRange,
          isLoading,
        }}
        rightChart={{
          title: t('deals.wonByDay'),
          data: wonChartData,
          chartType: "line",
          timeRange: chartTimeRange,
          onTimeRangeChange: setChartTimeRange,
          isLoading,
        }}
      />

      {!isLoading && filteredLeads.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title={t('deals.emptyTitle')}
          description={t('deals.emptyDescription')}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('deals.addDeal')}
            </Button>
          }
        />
      ) : (
        <CrmDataTable
          columns={allColumns}
          data={tableData}
          stickyFirstColumn
          enableBulkSelect
          searchKey="title"
          searchPlaceholder={t('deals.searchPlaceholder')}
          isLoading={isLoading}
          filterableColumns={[
            {
              id: "status",
              title: t('common.status'),
              options: [
                { label: t('deals.filters.open'), value: "open" },
                { label: t('deals.filters.won'), value: "won" },
                { label: t('deals.filters.lost'), value: "lost" },
              ],
            },
            {
              id: "priority",
              title: t('common.priority'),
              options: [
                { label: t('deals.priority.high'), value: "high" },
                { label: t('deals.priority.medium'), value: "medium" },
                { label: t('deals.priority.low'), value: "low" },
              ],
            },
          ]}
          bulkActions={[
            { label: t('deals.markWon'), value: "markWon" },
            { label: t('deals.markLost'), value: "markLost" },
            { label: t('common.delete'), value: "delete", variant: "destructive" },
          ]}
          onBulkAction={handleBulkAction}
          onRowClick={(row) => navigate({ to: `/dashboard/leads/${row._id}` })}
          rowActions={(row) => [
            {
              label: t('common.edit'),
              onClick: (r) => navigate({ to: `/dashboard/leads/${r._id}` }),
            },
            {
              label: t('deals.markWon'),
              icon: <Trophy className="h-3.5 w-3.5" />,
              onClick: handleMarkWon,
            },
            {
              label: t('deals.markLost'),
              icon: <XCircle className="h-3.5 w-3.5" />,
              onClick: handleMarkLost,
            },
            {
              label: t('common.delete'),
              icon: <Trash2 className="h-3.5 w-3.5" />,
              onClick: handleDelete,
            },
          ]}
          columnVisibility={effectiveColumnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          sorting={sorting}
          onSortingChange={setSorting}
          toolbarActions={
            <div className="flex items-center gap-2">
              <CsvExportButton organizationId={organizationId} entityType="leads" />
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
        entityType="leads"
        open={importOpen}
        onOpenChange={setImportOpen}
      />

      <SidePanel
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t('deals.newDeal')}
        description={t('deals.createDescription')}
      >
        <LeadForm
          pipelines={pipelines}
          stages={stages}
          customFieldDefinitions={cfDefs}
          isSubmitting={isSubmitting}
          onCancel={() => setCreateOpen(false)}
          onSubmit={async (data, customFieldRecord) => {
            setIsSubmitting(true);
            try {
              const customFields = cfDefs
                ? Object.entries(customFieldRecord)
                    .filter(([, v]) => v !== undefined && v !== "")
                    .map(([key, value]) => {
                      const def = cfDefs.find((d) => d.fieldKey === key);
                      return def
                        ? { fieldDefinitionId: def._id as Id<"customFieldDefinitions">, value }
                        : null;
                    })
                    .filter((f): f is NonNullable<typeof f> => f !== null)
                : undefined;
              await createLead({
                organizationId,
                ...data,
                customFields,
              });
              setCreateOpen(false);
            } finally {
              setIsSubmitting(false);
            }
          }}
        />
      </SidePanel>
    </div>
  );
}
