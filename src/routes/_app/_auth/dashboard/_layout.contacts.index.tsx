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
import { ContactForm } from "@/components/forms/contact-form";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Plus, Users, Trash2, Upload, Download } from "@/lib/ez-icons";
import { useCsvExport } from "@/components/csv/csv-export-button";
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
  "/_app/_auth/dashboard/_layout/contacts/"
)({
  component: ContactsIndex,
});

type Contact = Doc<"contacts">;

const DEFAULT_HIDDEN: Record<string, boolean> = {
  lastName: false,
  title: false,
  tags: false,
  notes: false,
  createdBy: false,
  updatedAt: false,
};

function ContactsIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const createContact = useMutation(api.contacts.create);
  const removeContact = useMutation(api.contacts.remove);
  const setCustomFieldValues = useMutation(api.customFields.setValues);

  const [panelOpen, setPanelOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [leftTimeRange, setLeftTimeRange] = useState<TimeRange>("last30days");
  const [rightTimeRange, setRightTimeRange] = useState<TimeRange>("all");
  const { handleExport } = useCsvExport(organizationId, "contacts");

  const systemViews = useMemo((): SavedView[] => [
    { id: "all", name: t('contacts.views.all'), isSystem: true, isDefault: true },
    { id: "my", name: t('contacts.views.my'), isSystem: true, isDefault: false },
    { id: "recent", name: t('contacts.views.recent'), isSystem: true, isDefault: false },
  ], [t]);

  const filterableFields = useMemo((): FieldDef[] => [
    { id: "source", label: t('common.source'), type: "text" },
    { id: "email", label: t('common.email'), type: "text" },
    { id: "createdAt", label: t('common.created'), type: "date" },
  ], [t]);

  const { data, isLoading } = useQuery(
    convexQuery(api.contacts.list, {
      organizationId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  );

  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );

  const contacts = data?.page ?? [];

  const contactIds = useMemo(() => contacts.map((c) => c._id as string), [contacts]);

  const { definitions: cfDefs, columns: cfColumns, defaultColumnVisibility: cfDefaultVis, mergeCustomFieldValues } =
    useCustomFieldColumns<Contact>({ organizationId, entityType: "contact", entityIds: contactIds });

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
    entityType: "contact",
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

  const filteredContacts = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    let data: Contact[];
    switch (activeViewId) {
      case "my":
        data = contacts;
        break;
      case "recent":
        data = contacts.filter((c) => c.createdAt >= sevenDaysAgo);
        break;
      default:
        data = contacts;
    }
    return applyFilters(data);
  }, [contacts, activeViewId, applyFilters]);

  const tableData = mergeCustomFieldValues(filteredContacts);

  const contactsByDay = useMemo<MiniChartData[]>(() => {
    const dayMap = new Map<string, number>();
    for (const c of contacts) {
      const day = new Date(c.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }
    return Array.from(dayMap.entries())
      .map(([label, value]) => ({ label, value }))
      .slice(-14);
  }, [contacts]);

  const contactsBySource = useMemo<MiniChartData[]>(() => {
    const srcMap = new Map<string, number>();
    for (const c of contacts) {
      const src = (c as Contact & { source?: string }).source ?? "Unknown";
      srcMap.set(src, (srcMap.get(src) ?? 0) + 1);
    }
    return Array.from(srcMap.entries()).map(([label, value]) => ({
      label,
      value,
    }));
  }, [contacts]);

  const sourceOptions = useMemo(() => {
    const sources = new Set<string>();
    for (const c of contacts) {
      const src = (c as Contact & { source?: string }).source;
      if (src) sources.add(src);
    }
    return Array.from(sources).map((s) => ({ label: s, value: s }));
  }, [contacts]);

  const columns: ColumnDef<Contact>[] = [
    {
      accessorKey: "firstName",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('contacts.contact')} />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">
              {row.original.firstName[0]}
              {row.original.lastName?.[0] ?? ""}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">
            {row.original.firstName} {row.original.lastName ?? ""}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "lastName",
      header: t('contacts.lastName'),
      cell: ({ getValue }) => (getValue() as string) ?? "—",
    },
    {
      accessorKey: "email",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('common.email')} />,
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{(getValue() as string) ?? "—"}</span>
      ),
    },
    {
      accessorKey: "phone",
      header: t('common.phone'),
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{(getValue() as string) ?? "—"}</span>
      ),
    },
    {
      accessorKey: "title",
      header: t('contacts.jobTitle'),
      cell: ({ getValue }) => (getValue() as string) ?? "—",
    },
    {
      accessorKey: "source",
      header: t('common.source'),
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{(getValue() as string) ?? "—"}</span>
      ),
      filterFn: (row, id, value) => (value as string[]).includes(row.getValue(id)),
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
        firstName: string;
        lastName?: string;
        email?: string;
        phone?: string;
        title?: string;
        source?: string;
        tags?: string[];
        notes?: string;
      },
      customFieldRecord: Record<string, unknown>
    ) => {
      setIsCreating(true);
      try {
        const contactId = await createContact({
          organizationId,
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          title: formData.title,
          notes: formData.notes,
          tags: formData.tags,
        });
        if (cfDefs && Object.keys(customFieldRecord).length > 0) {
          const fields = cfDefs
            .filter((d) => customFieldRecord[d.fieldKey] !== undefined && customFieldRecord[d.fieldKey] !== "")
            .map((d) => ({ fieldDefinitionId: d._id as any, value: customFieldRecord[d.fieldKey] }));
          if (fields.length > 0) {
            await setCustomFieldValues({
              organizationId,
              entityType: "contact" as any,
              entityId: contactId as string,
              fields,
            });
          }
        }
        setPanelOpen(false);
      } finally {
        setIsCreating(false);
      }
    },
    [createContact, organizationId, cfDefs, setCustomFieldValues]
  );

  const handleBulkAction = useCallback(
    async (action: string, selectedRows: Contact[]) => {
      if (action === "delete") {
        for (const row of selectedRows) {
          await removeContact({ organizationId, contactId: row._id });
        }
      }
    },
    [removeContact, organizationId]
  );

  const rowActions = useCallback(
    (row: Contact) => [
      {
        label: t('common.edit'),
        onClick: () => navigate({ to: `/dashboard/contacts/${row._id}` }),
      },
      {
        label: t('common.delete'),
        icon: <Trash2 className="h-3.5 w-3.5" />,
        onClick: async () => {
          if (window.confirm(t('contacts.confirmDelete'))) {
            await removeContact({ organizationId, contactId: row._id });
          }
        },
      },
    ],
    [navigate, removeContact, organizationId]
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('contacts.title')}
        description={t('contacts.description')}
        actions={
          <Button onClick={() => setPanelOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('contacts.addContact')}
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
          title: t('contacts.byDay'),
          data: contactsByDay,
          chartType: "line",
          timeRange: leftTimeRange,
          onTimeRangeChange: setLeftTimeRange,
        }}
        rightChart={{
          title: t('contacts.bySource'),
          data: contactsBySource,
          chartType: "bar",
          timeRange: rightTimeRange,
          onTimeRangeChange: setRightTimeRange,
        }}
      />

      <QuickActionBar
        actions={[
          {
            label: t('quickActions.newContact'),
            icon: <Plus className="mr-1.5 h-3.5 w-3.5" />,
            onClick: () => setPanelOpen(true),
            feature: "contacts",
            action: "create",
          },
          {
            label: t('quickActions.importCsv'),
            icon: <Upload className="mr-1.5 h-3.5 w-3.5" />,
            onClick: () => setImportOpen(true),
            feature: "contacts",
            action: "create",
          },
        ]}
        extra={null}
      />

      {!isLoading && filteredContacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('contacts.emptyTitle')}
          description={t('contacts.emptyDescription')}
          action={
            <Button onClick={() => setPanelOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('contacts.addContact')}
            </Button>
          }
        />
      ) : (
        <CrmDataTable
          columns={allColumns}
          data={tableData}
          stickyFirstColumn
          searchKey="firstName"
          searchPlaceholder={t('contacts.searchPlaceholder')}
          isLoading={isLoading}
          enableBulkSelect
          bulkActions={[
            { label: t('common.delete'), value: "delete", variant: "destructive" },
          ]}
          onBulkAction={handleBulkAction}
          rowActions={rowActions}
          onRowClick={(row) => navigate({ to: `/dashboard/contacts/${row._id}` })}
          totalCount={filteredContacts.length}
          filterableColumns={sourceOptions.length > 0 ? [
            { id: "source", title: t('common.source'), options: sourceOptions },
          ] : []}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          sorting={sorting}
          onSortingChange={setSorting}
          toolbarDropdownActions={[
            { label: t("csv.export"), icon: <Download className="h-4 w-4" />, onClick: handleExport },
            { label: t("csv.import"), icon: <Upload className="h-4 w-4" />, onClick: () => setImportOpen(true) },
          ]}
        />
      )}

      <CsvImportDialog
        organizationId={organizationId}
        entityType="contacts"
        open={importOpen}
        onOpenChange={setImportOpen}
      />

      <SidePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={t('contacts.createContact')}
        description={t('contacts.createDescription')}
      >
        <ContactForm
          onSubmit={handleCreate}
          onCancel={() => setPanelOpen(false)}
          isSubmitting={isCreating}
          showSourceAndTags
          customFieldDefinitions={cfDefs}
        />
      </SidePanel>
    </div>
  );
}
