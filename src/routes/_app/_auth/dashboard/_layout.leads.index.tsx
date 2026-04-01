import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseLeadsList } from "@/hooks/use-supabase-leads";
import { useSupabasePipelinesList, useSupabasePipelineStages } from "@/hooks/use-supabase-pipelines";
import { useSupabaseCompaniesList } from "@/hooks/use-supabase-companies";
import { useQueryClient } from "@tanstack/react-query";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import type { MappedLead } from "@/lib/supabase/mappers";
import { PageHeader } from "@/components/layout/page-header";
import {
  CrmDataTable,
  type CrmColumn,
  useColumnVisibility,
  useAllColumns,
} from "@/components/crm/enhanced-data-table";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import { MiniChartsRow } from "@/components/crm/mini-charts";
import { SidePanel } from "@/components/crm/side-panel";
import { LeadForm } from "@/components/forms/lead-form";
import { leadStatusOptions, leadPriorityOptions } from "@/lib/options";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  TableIcon,
  KanbanIcon,
  Trophy,
  XCircle,
  Trash2,
  Upload,
} from "@/lib/ez-icons";
import { useCsvExport } from "@/components/csv/csv-export-button";
import { Download } from "@/lib/ez-icons";
import { CsvImportDialog } from "@/components/csv/csv-import-dialog";
import { Id } from "@cvx/_generated/dataModel";
import { useState, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { SavedView, TimeRange, FieldDef } from "@/components/crm/types";
import type { MiniChartData } from "@/components/crm/mini-charts";
import { useSavedViews } from "@/hooks/use-saved-views";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { useCustomFieldColumns } from "@/hooks/use-custom-field-columns";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { TagsManagerSlideout } from "@/components/categories-tags/tags-manager-slideout";
import { CategoriesManagerSlideout } from "@/components/categories-tags/categories-manager-slideout";

export const Route = createFileRoute("/_app/_auth/dashboard/_layout/leads/")({
  component: LeadsIndex,
});

type Lead = MappedLead;
type LeadRow = Lead & { __cfValues: Record<string, unknown> };

const stageColors: Record<string, string> = {
  New: "bg-sky-100 text-sky-700",
  Qualified: "bg-violet-100 text-violet-700",
  Proposal: "bg-amber-100 text-amber-700",
  Negotiation: "bg-orange-100 text-orange-700",
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

function LeadsIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const updateLead = useMutation(api.leads.update);
  const removeLead = useMutation(api.leads.remove);
  const createLead = useMutation(api.leads.create);
  const queryClient = useQueryClient();

  const toolbarRef = useRef<React.ReactNode>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const { handleExport } = useCsvExport(organizationId, "leads");
  const { tags } = useTagDefinitions(organizationId);
  const { categories } = useCategoryDefinitions(organizationId, "lead");
  const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);
  const [categoriesSlideoutOpen, setCategoriesSlideoutOpen] = useState(false);

  // Sidebar action dispatches
  useSidebarDispatch("importCsv", () => setImportOpen(true));
  useSidebarDispatch("exportCsv", () => handleExport());
  const [chartTimeRange, setChartTimeRange] = useState<TimeRange>("last30days");

  const systemViews = useMemo(
    (): SavedView[] => [
      {
        id: "all",
        name: t("deals.views.all"),
        isSystem: true,
        isDefault: true,
      },
      {
        id: "my-deals",
        name: t("deals.views.myDeals"),
        isSystem: true,
        isDefault: false,
      },
      {
        id: "recently-assigned",
        name: t("deals.views.recentlyAssigned"),
        isSystem: true,
        isDefault: false,
      },
      {
        id: "this-month",
        name: t("deals.views.thisMonth"),
        isSystem: true,
        isDefault: false,
      },
      {
        id: "won",
        name: t("deals.views.won"),
        isSystem: true,
        isDefault: false,
      },
    ],
    [t],
  );

  const filterableFields = useMemo(
    (): FieldDef[] => [
      { id: "title", label: t("deals.dealTitle"), type: "text" },
      { id: "value", label: t("deals.dealValue"), type: "number" },
      { id: "currency", label: t("deals.currency"), type: "text" },
      {
        id: "status",
        label: t("common.status"),
        type: "select",
        options: leadStatusOptions(t),
      },
      {
        id: "priority",
        label: t("common.priority"),
        type: "select",
        options: leadPriorityOptions(t),
      },
      { id: "source", label: t("common.source"), type: "text" },
      {
        id: "expectedCloseDate",
        label: t("deals.expectedClose"),
        type: "date",
      },
      { id: "createdAt", label: t("common.created"), type: "date" },
      { id: "tagIds", label: t('common.tags', { defaultValue: "Tagi" }), type: "multiSelect" as const, options: tags.map(tag => ({ label: tag.name, value: tag._id })) },
      { id: "categoryId", label: t('common.category', { defaultValue: "Kategoria" }), type: "select" as const, options: categories.map(cat => ({ label: cat.name, value: cat._id })) },
    ],
    [t, tags, categories],
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
    entityType: "lead",
    systemViews: systemViews,
  });

  const { data: pipelines } = useSupabasePipelinesList(organizationId);

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(
    null,
  );
  const activePipeline =
    pipelines?.find((p) => p._id === selectedPipelineId) ??
    pipelines?.find((p) => p.isDefault) ??
    pipelines?.[0];

  const firstPipelineId = pipelines?.[0]?._id;
  const { data: stages } = useSupabasePipelineStages(
    organizationId,
    firstPipelineId,
    { enabled: !!firstPipelineId },
  );

  const { data, isLoading } = useSupabaseLeadsList(organizationId);

  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId }),
  );

  const { data: companiesData } = useSupabaseCompaniesList(organizationId, { limit: 500 });

  const userLookup = useMemo(() => {
    const map = new Map<string, string>();
    if (members) {
      for (const m of members) {
        if (m.user)
          map.set(m.user._id, m.user.name ?? m.user.email ?? "Unknown");
      }
    }
    return map;
  }, [members]);

  const companyLookup = useMemo(() => {
    const map = new Map<string, string>();
    if (companiesData) {
      for (const c of companiesData) {
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

  const leadIds = useMemo(
    () => filteredLeads.map((l) => l._id as string),
    [filteredLeads],
  );
  const {
    definitions: cfDefs,
    columns: cfColumns,
    mergeCustomFieldValues,
  } = useCustomFieldColumns<Lead>({
    organizationId,
    entityType: "lead",
    entityIds: leadIds,
  });
  const searchedLeads = useMemo(() => {
    if (!searchValue) return filteredLeads;
    const q = searchValue.toLowerCase();
    return filteredLeads.filter((l) => l.title?.toLowerCase().includes(q));
  }, [filteredLeads, searchValue]);

  const tableData = mergeCustomFieldValues(searchedLeads);

  const stageChartData: MiniChartData[] = useMemo(() => {
    if (!stages) return [];
    const countMap = new Map<string, number>();
    for (const s of stages) countMap.set(s.name, 0);
    for (const l of leads) {
      if (l.pipelineStageId) {
        const stage = stages.find((s) => s._id === l.pipelineStageId);
        if (stage)
          countMap.set(stage.name, (countMap.get(stage.name) ?? 0) + 1);
      }
    }
    return Array.from(countMap.entries()).map(([label, value]) => ({
      label,
      value,
    }));
  }, [leads, stages]);

  const wonChartData: MiniChartData[] = useMemo(() => {
    const wonLeads = leads.filter((l) => l.status === "won" && l.wonAt);
    const dayMap = new Map<string, number>();
    for (const l of wonLeads) {
      const day = new Date(l.wonAt!).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }
    return Array.from(dayMap.entries())
      .map(([label, value]) => ({ label, value }))
      .slice(-7);
  }, [leads]);

  const columns: CrmColumn<LeadRow>[] = [
    {
      id: "title",
      label: t("deals.dealName"),
      sortable: true,
      isRowHeader: true,
      render: (item) => (
        <Link
          to="/dashboard/leads/$leadId"
          params={{ leadId: item._id }}
          className="font-medium text-fg-primary hover:text-brand-secondary"
        >
          {item.title}
        </Link>
      ),
      getSortValue: (item) => item.title ?? "",
    },
    {
      id: "stage",
      label: t("deals.stage"),
      render: (item) => {
        const stageId = item.pipelineStageId;
        if (!stageId || !stages) return "—";
        const stage = stages.find((s) => s._id === stageId);
        if (!stage) return "—";
        return (
          <Badge
            variant="secondary"
            className={`text-xs ${stageColors[stage.name] ?? "bg-gray-100 text-gray-700"}`}
          >
            {stage.name}
          </Badge>
        );
      },
    },
    {
      id: "value",
      label: t("common.amount"),
      sortable: true,
      render: (item) => (item.value ? formatCurrency(item.value) : "—"),
      getSortValue: (item) => item.value ?? 0,
    },
    {
      id: "currency",
      label: t("deals.currency"),
      render: (item) => item.currency ?? "—",
    },
    {
      id: "expectedCloseDate",
      label: t("deals.expectedClose"),
      sortable: true,
      render: (item) =>
        item.expectedCloseDate
          ? new Date(item.expectedCloseDate).toLocaleDateString()
          : "—",
      getSortValue: (item) => item.expectedCloseDate ?? 0,
    },
    {
      id: "status",
      label: t("common.status"),
      render: (item) => item.status ?? "—",
    },
    {
      id: "priority",
      label: t("common.priority"),
      render: (item) => item.priority ?? "—",
    },
    {
      id: "source",
      label: t("common.source"),
      render: (item) => item.source ?? "—",
    },
    {
      id: "company",
      label: t("deals.company"),
      render: (item) =>
        item.companyId ? companyLookup.get(item.companyId) ?? "—" : "—",
    },
    {
      id: "assignedTo",
      label: t("deals.assignedTo"),
      render: (item) =>
        item.assignedTo ? userLookup.get(item.assignedTo) ?? "—" : "—",
    },
    {
      id: "tags",
      label: t("common.tags"),
      render: (item) => {
        const tags = item.tags;
        if (!tags || tags.length === 0) return "—";
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag: any) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      id: "notes",
      label: t("common.notes"),
      render: (item) => item.notes ?? "—",
    },
    {
      id: "wonAt",
      label: t("deals.wonDate"),
      render: (item) =>
        item.wonAt ? new Date(item.wonAt).toLocaleDateString() : "—",
    },
    {
      id: "lostAt",
      label: t("deals.lostDate"),
      render: (item) =>
        item.lostAt ? new Date(item.lostAt).toLocaleDateString() : "—",
    },
    {
      id: "lostReason",
      label: t("deals.lostReason"),
      render: (item) => item.lostReason ?? "—",
    },
    {
      id: "createdBy",
      label: t("common.createdBy"),
      render: (item) => userLookup.get(item.createdBy) ?? "—",
    },
    {
      id: "createdAt",
      label: t("common.created"),
      sortable: true,
      render: (item) => new Date(item.createdAt).toLocaleDateString(),
      getSortValue: (item) => item.createdAt,
    },
    {
      id: "updatedAt",
      label: t("common.updated"),
      sortable: true,
      render: (item) => new Date(item.updatedAt).toLocaleDateString(),
      getSortValue: (item) => item.updatedAt,
    },
  ];

  const mergedColumns = useMemo(
    () => [...columns, ...cfColumns],
    [columns, cfColumns],
  );
  const { allColumns, defaultHidden } = useAllColumns(mergedColumns, filterableFields);
  const { hiddenColumnIds, toggleColumn } = useColumnVisibility(defaultHidden);

  const handleMarkWon = async (lead: LeadRow) => {
    await updateLead({ organizationId, leadId: lead._id as Id<"leads">, status: "won" });
    queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
  };

  const handleMarkLost = async (lead: LeadRow) => {
    await updateLead({ organizationId, leadId: lead._id as Id<"leads">, status: "lost" });
    queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
  };

  const handleDelete = async (lead: LeadRow) => {
    await removeLead({ organizationId, leadId: lead._id as Id<"leads"> });
    queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
  };

  const handleBulkAction = useCallback(
    async (action: string, selectedRows: LeadRow[]) => {
      switch (action) {
        case "markWon":
          for (const row of selectedRows) {
            await updateLead({
              organizationId,
              leadId: row._id as Id<"leads">,
              status: "won",
            });
          }
          break;
        case "markLost":
          for (const row of selectedRows) {
            await updateLead({
              organizationId,
              leadId: row._id as Id<"leads">,
              status: "lost",
            });
          }
          break;
        case "delete":
          for (const row of selectedRows) {
            await removeLead({ organizationId, leadId: row._id as Id<"leads"> });
          }
          break;
      }
      queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
    },
    [updateLead, removeLead, organizationId, queryClient],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("deals.title")}
        description={t("deals.description")}
        actions={
          <div className="flex items-center gap-2">
            {pipelines && pipelines.length > 0 && (
              <Select
                value={activePipeline?._id ?? ""}
                onValueChange={setSelectedPipelineId}
              >
                <SelectTrigger className="h-9 w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex rounded-md border">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-r-none bg-accent"
              >
                <TableIcon className="h-4 w-4" variant="stroke" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-l-none"
                onClick={() => navigate({ to: "/dashboard/pipelines" })}
              >
                <KanbanIcon className="h-4 w-4" variant="stroke" />
              </Button>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              {t("deals.addDeal")}
            </Button>
          </div>
        }
      />

      <DataListFilterBar
        views={views as any}
        activeViewId={activeViewId}
        onViewChange={onViewChange}
        onCreateView={onCreateView}
        onDeleteView={onDeleteView}
        filterableFields={filterableFields}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder={t("deals.searchPlaceholder")}
        onTagsManage={() => setTagsSlideoutOpen(true)}
        onCategoriesManage={() => setCategoriesSlideoutOpen(true)}
        dropdownActions={[
          {
            label: t("csv.export"),
            icon: <Download className="h-4 w-4" variant="stroke" />,
            onClick: handleExport,
          },
          {
            label: t("csv.import"),
            icon: <Upload className="h-4 w-4" variant="stroke" />,
            onClick: () => setImportOpen(true),
          },
        ]}
        columnDefs={allColumns.map(c => ({ id: c.id, label: c.label ?? c.id }))}
        hiddenColumnIds={hiddenColumnIds}
        onToggleColumn={toggleColumn}
        renderToolbar={(toolbar) => { toolbarRef.current = toolbar; return null; }}
      />

      <MiniChartsRow
        leftChart={{
          title: t("deals.byStage"),
          data: stageChartData,
          chartType: "bar",
          timeRange: chartTimeRange,
          onTimeRangeChange: setChartTimeRange,
          isLoading,
        }}
        rightChart={{
          title: t("deals.wonByDay"),
          data: wonChartData,
          chartType: "line",
          timeRange: chartTimeRange,
          onTimeRangeChange: setChartTimeRange,
          isLoading,
        }}
      />

      <CrmDataTable
        columns={allColumns}
        data={tableData}
        enableBulkSelect
        isLoading={isLoading}
        hiddenColumnIds={hiddenColumnIds}
        toolbar={toolbarRef.current}
        bulkActions={[
          { label: t("deals.markWon"), value: "markWon" },
          { label: t("deals.markLost"), value: "markLost" },
          {
            label: t("common.delete"),
            value: "delete",
            variant: "destructive",
          },
        ]}
        onBulkAction={handleBulkAction}
        onRowClick={(row) => navigate({ to: `/dashboard/leads/${row._id}` })}
        rowActions={(_row) => [
          {
            label: t("common.edit"),
            onClick: (r) => navigate({ to: `/dashboard/leads/${r._id}` }),
          },
          {
            label: t("deals.markWon"),
            icon: <Trophy className="h-4 w-4" variant="stroke" />,
            onClick: handleMarkWon,
          },
          {
            label: t("deals.markLost"),
            icon: <XCircle className="h-4 w-4" variant="stroke" />,
            onClick: handleMarkLost,
          },
          {
            label: t("common.delete"),
            icon: <Trash2 className="h-4 w-4" variant="stroke" />,
            onClick: handleDelete,
          },
        ]}
        emptyTitle={t("deals.emptyTitle")}
        emptyDescription={t("deals.emptyDescription")}
      />

      <CsvImportDialog
        organizationId={organizationId}
        entityType="leads"
        open={importOpen}
        onOpenChange={setImportOpen}
      />

      <SidePanel
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t("deals.newDeal")}
        description={t("deals.createDescription")}
      >
        <LeadForm
          pipelines={pipelines as any}
          stages={stages as any}
          customFieldDefinitions={cfDefs}
          tagDefinitions={tags}
          categoryDefinitions={categories}
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
                        ? {
                            fieldDefinitionId:
                              def._id as Id<"customFieldDefinitions">,
                            value,
                          }
                        : null;
                    })
                    .filter((f): f is NonNullable<typeof f> => f !== null)
                : undefined;
              await createLead({
                organizationId,
                ...data,
                customFields,
              });
              queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
              setCreateOpen(false);
            } finally {
              setIsSubmitting(false);
            }
          }}
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
        entityType="lead"
        categories={categories}
      />
    </div>
  );
}
