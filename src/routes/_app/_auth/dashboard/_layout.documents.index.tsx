import { useState, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable } from "@/components/crm/enhanced-data-table";
import { SavedViewsTabs } from "@/components/crm/saved-views-tabs";
import { MiniChartsRow } from "@/components/crm/mini-charts";
import { SidePanel } from "@/components/crm/side-panel";
import { CustomFieldFormSection } from "@/components/custom-fields/custom-field-form-section";
import { useCustomFieldColumns } from "@/hooks/use-custom-field-columns";
import { useCustomFieldForm } from "@/hooks/use-custom-field-form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { SavedView, TimeRange, FieldDef } from "@/components/crm/types";
import type { MiniChartData } from "@/components/crm/mini-charts";
import { Doc } from "@cvx/_generated/dataModel";
import { useSavedViews } from "@/hooks/use-saved-views";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/documents/"
)({
  component: DocumentsIndex,
});

type Document = Doc<"documents">;
type DocumentRow = Document & { __cfValues: Record<string, unknown> };
type DocumentStatus = "draft" | "sent" | "accepted" | "lost";
type DocumentCategory = "proposal" | "contract" | "invoice" | "presentation" | "report" | "other";

const STATUS_CONFIG: Record<DocumentStatus, { color: string; labelKey: string }> = {
  draft: { color: "bg-gray-100 text-gray-700", labelKey: "documents.status.draft" },
  sent: { color: "bg-blue-100 text-blue-700", labelKey: "documents.status.sent" },
  accepted: { color: "bg-green-100 text-green-700", labelKey: "documents.status.accepted" },
  lost: { color: "bg-red-100 text-red-700", labelKey: "documents.status.lost" },
};

const inputClasses =
  "h-9 w-full rounded-md border bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

function formatCurrency(amount?: number): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
  }).format(amount);
}

function DocumentsIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const systemViews: SavedView[] = useMemo(() => [
    { id: "all", name: t('documents.views.all'), isSystem: true, isDefault: true },
    { id: "my-documents", name: t('documents.views.my'), isSystem: true, isDefault: false },
  ], [t]);

  const filterableFields = useMemo((): FieldDef[] => [
    {
      id: "status", label: t('common.status'), type: "select",
      options: [
        { label: t('documents.status.draft'), value: "draft" },
        { label: t('documents.status.sent'), value: "sent" },
        { label: t('documents.status.accepted'), value: "accepted" },
        { label: t('documents.status.lost'), value: "lost" },
      ],
    },
    {
      id: "category", label: t('common.category'), type: "select",
      options: [
        { label: t('documents.category.proposal'), value: "proposal" },
        { label: t('documents.category.contract'), value: "contract" },
        { label: t('documents.category.invoice'), value: "invoice" },
        { label: t('documents.category.presentation'), value: "presentation" },
        { label: t('documents.category.report'), value: "report" },
        { label: t('documents.category.other'), value: "other" },
      ],
    },
    { id: "createdAt", label: t('common.created'), type: "date" },
  ], [t]);

  const {
    views, activeViewId, onViewChange, onCreateView, onUpdateView, onDeleteView, applyFilters,
  } = useSavedViews({ organizationId, entityType: "document", systemViews });
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [statusChangeDoc, setStatusChangeDoc] = useState<Document | null>(null);
  const [newStatus, setNewStatus] = useState<DocumentStatus>("draft");

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<DocumentCategory | "">("");
  const [status, setStatus] = useState<DocumentStatus>("draft");
  const [amount, setAmount] = useState("");

  // Chart time ranges
  const [statusChartRange, setStatusChartRange] = useState<TimeRange>("last30days");
  const [sentChartRange, setSentChartRange] = useState<TimeRange>("last7days");

  const { data: currentUser } = useQuery(
    convexQuery(api.app.getCurrentUser, {})
  );

  const { data, isLoading } = useQuery(
    convexQuery(api.documents.list, {
      organizationId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  );

  const allDocuments = data?.page ?? [];

  const documents = useMemo(() => {
    let data = allDocuments;
    if (activeViewId === "my-documents" && currentUser) {
      data = allDocuments.filter((d) => d.createdBy === currentUser._id);
    }
    return applyFilters(data);
  }, [activeViewId, allDocuments, currentUser, applyFilters]);

  // Chart data
  const statusChartData = useMemo((): MiniChartData[] => {
    const statusKeys: DocumentStatus[] = ["draft", "sent", "accepted", "lost"];
    const counts: Record<DocumentStatus, number> = { draft: 0, sent: 0, accepted: 0, lost: 0 };
    for (const doc of allDocuments) {
      const s = (doc.status ?? "draft") as DocumentStatus;
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return statusKeys.map((key) => ({
      label: t(STATUS_CONFIG[key].labelKey),
      value: counts[key],
    }));
  }, [allDocuments, t]);

  const sentByDayData = useMemo((): MiniChartData[] => {
    const sentDocs = allDocuments.filter((d) => d.status && d.status !== "draft");
    const days: Record<string, number> = {};
    for (const doc of sentDocs) {
      const date = new Date(doc.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      days[date] = (days[date] ?? 0) + 1;
    }
    return Object.entries(days)
      .slice(-7)
      .map(([label, value]) => ({ label, value }));
  }, [allDocuments]);

  // Custom fields — table columns
  const documentIds = useMemo(() => documents.map((d) => d._id as string), [documents]);

  const { columns: cfColumns, defaultColumnVisibility, mergeCustomFieldValues } =
    useCustomFieldColumns<Document>({ organizationId, entityType: "document", entityIds: documentIds });

  // Custom fields — form
  const {
    definitions: cfDefs,
    values: cfValues,
    onChange: onCfChange,
    resetValues: resetCfValues,
    loadValuesFromEntity,
    saveValues: saveCfValues,
  } = useCustomFieldForm({ organizationId, entityType: "document" });

  const createDocument = useMutation(api.documents.create);
  const updateDocument = useMutation(api.documents.update);
  const removeDocument = useMutation(api.documents.remove);
  const updateStatus = useMutation(api.documents.updateStatus);

  const resetForm = () => {
    setName("");
    setDescription("");
    setCategory("");
    setStatus("draft");
    setAmount("");
    resetCfValues();
    setEditingDoc(null);
  };

  const openCreatePanel = () => {
    resetForm();
    setPanelOpen(true);
  };

  const openEditPanel = (doc: DocumentRow) => {
    setEditingDoc(doc);
    setName(doc.name);
    setDescription(doc.description ?? "");
    setCategory((doc.category as DocumentCategory) ?? "");
    setStatus((doc.status as DocumentStatus) ?? "draft");
    setAmount(doc.amount != null ? String(doc.amount) : "");
    loadValuesFromEntity(doc.__cfValues);
    setPanelOpen(true);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const categoryVal = category || undefined;
      const amountVal = amount ? parseFloat(amount) : undefined;

      let documentId: string;
      if (editingDoc) {
        documentId = await updateDocument({
          organizationId,
          documentId: editingDoc._id,
          name: name.trim(),
          description: description.trim() || undefined,
          category: categoryVal as any,
          status: status as any,
          amount: amountVal,
        });
      } else {
        documentId = await createDocument({
          organizationId,
          name: name.trim(),
          description: description.trim() || undefined,
          category: categoryVal as any,
          status: status as any,
          amount: amountVal,
        });
      }
      await saveCfValues(documentId);
      setPanelOpen(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Merge custom field values into row data
  const tableData: DocumentRow[] = useMemo(
    () => mergeCustomFieldValues(documents),
    [mergeCustomFieldValues, documents]
  );

  const baseColumns: ColumnDef<DocumentRow, unknown>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('common.title')} />
      ),
      cell: ({ row }) => (
        <div>
          <span className="font-medium">{row.original.name}</span>
          {row.original.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {row.original.description}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "category",
      header: t('common.category'),
      cell: ({ getValue }) => {
        const v = getValue() as string | undefined;
        return v ? (
          <Badge variant="outline" className="capitalize">
            {v}
          </Badge>
        ) : (
          "—"
        );
      },
      filterFn: (row, id, value) =>
        (value as string[]).includes(row.getValue(id)),
    },
    {
      accessorKey: "status",
      header: t('common.status'),
      cell: ({ getValue }) => {
        const val = (getValue() as DocumentStatus | undefined) ?? "draft";
        const config = STATUS_CONFIG[val];
        return (
          <Badge variant="secondary" className={config?.color ?? ""}>
            {config ? t(config.labelKey) : val}
          </Badge>
        );
      },
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('common.amount')} />
      ),
      cell: ({ getValue }) => formatCurrency(getValue() as number | undefined),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('common.created')} />
      ),
      cell: ({ getValue }) =>
        new Date(getValue() as number).toLocaleDateString(),
    },
  ];

  const columns = useMemo(
    () => [...baseColumns, ...cfColumns],
    [baseColumns, cfColumns]
  );

  const rowActions = (row: DocumentRow) => [
    {
      label: t('common.edit'),
      icon: <Pencil className="h-3.5 w-3.5" />,
      onClick: () => openEditPanel(row),
    },
    {
      label: t('documents.changeStatus'),
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      onClick: () => {
        setStatusChangeDoc(row);
        setNewStatus((row.status as DocumentStatus) ?? "draft");
      },
    },
    {
      label: t('common.delete'),
      icon: <Trash2 className="h-3.5 w-3.5" />,
      onClick: () => removeDocument({ organizationId, documentId: row._id }),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('documents.title')}
        description={t('documents.description')}
        actions={
          <Button onClick={openCreatePanel}>
            <Plus className="mr-2 h-4 w-4" />
            {t('documents.newDocument')}
          </Button>
        }
      />

      <MiniChartsRow
        leftChart={{
          title: t('documents.byStatus'),
          data: statusChartData,
          chartType: "bar",
          timeRange: statusChartRange,
          onTimeRangeChange: setStatusChartRange,
        }}
        rightChart={{
          title: t('documents.sentByDay'),
          data: sentByDayData,
          chartType: "line",
          timeRange: sentChartRange,
          onTimeRangeChange: setSentChartRange,
        }}
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

      <CrmDataTable
        columns={columns}
        data={tableData}
        stickyFirstColumn
        rowActions={rowActions}
        searchKey="name"
        searchPlaceholder={t('documents.searchPlaceholder')}
        defaultColumnVisibility={defaultColumnVisibility}
        filterableColumns={[
          {
            id: "category",
            title: t('common.category'),
            options: [
              { label: t('documents.category.proposal'), value: "proposal" },
              { label: t('documents.category.contract'), value: "contract" },
              { label: t('documents.category.invoice'), value: "invoice" },
              { label: t('documents.category.presentation'), value: "presentation" },
              { label: t('documents.category.report'), value: "report" },
              { label: t('documents.category.other'), value: "other" },
            ],
          },
        ]}
        isLoading={isLoading}
        onRowClick={(row) =>
          navigate({ to: `/dashboard/documents/${row._id}` })
        }
      />

      {/* Status change inline dialog */}
      {statusChangeDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border p-6 shadow-lg w-[320px] space-y-4">
            <h3 className="font-semibold">{t('documents.changeStatus')}</h3>
            <p className="text-sm text-muted-foreground">
              {statusChangeDoc.name}
            </p>
            <select
              className={inputClasses}
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as DocumentStatus)}
            >
              <option value="draft">{t('documents.status.draft')}</option>
              <option value="sent">{t('documents.status.sent')}</option>
              <option value="accepted">{t('documents.status.accepted')}</option>
              <option value="lost">{t('documents.status.lost')}</option>
            </select>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatusChangeDoc(null)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  await updateStatus({
                    organizationId,
                    documentId: statusChangeDoc._id,
                    status: newStatus,
                  });
                  setStatusChangeDoc(null);
                }}
              >
                {t('common.update')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <SidePanel
        open={panelOpen}
        onOpenChange={(open) => {
          setPanelOpen(open);
          if (!open) resetForm();
        }}
        title={editingDoc ? t('documents.editDocument') : t('documents.newDocument')}
        description={editingDoc ? t('documents.updateDescription') : t('documents.createDescription')}
        onSubmit={handleSubmit}
        submitLabel={editingDoc ? t('common.update') : t('common.create')}
        isSubmitting={isSubmitting}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              {t('common.name')} <span className="text-destructive">*</span>
            </Label>
            <input
              className={inputClasses}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('documents.documentName')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('common.description')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('documents.documentDescription')}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('common.category')}</Label>
            <select
              className={inputClasses}
              value={category}
              onChange={(e) => setCategory(e.target.value as DocumentCategory | "")}
            >
              <option value="">{t('common.none')}</option>
              <option value="proposal">{t('documents.category.proposal')}</option>
              <option value="contract">{t('documents.category.contract')}</option>
              <option value="invoice">{t('documents.category.invoice')}</option>
              <option value="presentation">{t('documents.category.presentation')}</option>
              <option value="report">{t('documents.category.report')}</option>
              <option value="other">{t('documents.category.other')}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('common.status')}</Label>
            <select
              className={inputClasses}
              value={status}
              onChange={(e) => setStatus(e.target.value as DocumentStatus)}
            >
              <option value="draft">{t('documents.status.draft')}</option>
              <option value="sent">{t('documents.status.sent')}</option>
              <option value="accepted">{t('documents.status.accepted')}</option>
              <option value="lost">{t('documents.status.lost')}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('common.amount')}</Label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputClasses}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {cfDefs && cfDefs.length > 0 && (
            <CustomFieldFormSection
              definitions={cfDefs}
              values={cfValues}
              onChange={onCfChange}
            />
          )}
        </div>
      </SidePanel>
    </div>
  );
}
