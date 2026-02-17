import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable } from "@/components/crm/enhanced-data-table";
import { SavedViewsTabs } from "@/components/crm/saved-views-tabs";
import { SidePanel } from "@/components/crm/side-panel";
import { TreatmentForm } from "@/components/gabinet/treatment-form";
import type { TreatmentFormData } from "@/components/gabinet/treatment-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Plus, Stethoscope, Pencil, Trash2, Power } from "@/lib/ez-icons";
import { EmptyState } from "@/components/layout/empty-state";
import type { ColumnDef } from "@tanstack/react-table";
import type { SavedView, FieldDef } from "@/components/crm/types";
import { Doc } from "@cvx/_generated/dataModel";
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSavedViews } from "@/hooks/use-saved-views";
import { QuickActionBar } from "@/components/crm/quick-action-bar";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/treatments/"
)({
  component: TreatmentsIndex,
});

type Treatment = Doc<"gabinetTreatments">;

function formatCurrency(amount: number, currency?: string): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: currency ?? "PLN",
  }).format(amount);
}

function TreatmentsIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const createTreatment = useMutation(api["gabinet/treatments"].create);
  const updateTreatment = useMutation(api["gabinet/treatments"].update);
  const removeTreatment = useMutation(api["gabinet/treatments"].remove);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingTreatment, setEditingTreatment] = useState<Treatment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const systemViews = useMemo((): SavedView[] => [
    { id: "all", name: t("gabinet.treatments.views.all"), isSystem: true, isDefault: true },
    { id: "active", name: t("gabinet.treatments.views.active"), isSystem: true, isDefault: false },
    { id: "inactive", name: t("gabinet.treatments.views.inactive"), isSystem: true, isDefault: false },
  ], [t]);

  const filterableFields = useMemo((): FieldDef[] => [
    { id: "category", label: t("gabinet.treatments.category"), type: "text" },
    { id: "price", label: t("gabinet.treatments.price"), type: "number" },
  ], [t]);

  const { data, isLoading } = useQuery(
    convexQuery(api["gabinet/treatments"].list, {
      organizationId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  );

  const allTreatments = data?.page ?? [];

  const {
    views,
    activeViewId,
    onViewChange,
    onCreateView,
    onUpdateView,
    onDeleteView,
    applyFilters,
  } = useSavedViews({
    organizationId,
    entityType: "gabinetTreatment",
    systemViews,
  });

  const filteredTreatments = useMemo(() => {
    let data: Treatment[];
    switch (activeViewId) {
      case "active":
        data = allTreatments.filter((t) => t.isActive);
        break;
      case "inactive":
        data = allTreatments.filter((t) => !t.isActive);
        break;
      default:
        data = allTreatments;
    }
    return applyFilters(data);
  }, [allTreatments, activeViewId, applyFilters]);

  const categoryOptions = useMemo(() => {
    const cats = new Set<string>();
    for (const tr of allTreatments) {
      if (tr.category) cats.add(tr.category);
    }
    return Array.from(cats).map((c) => ({ label: c, value: c }));
  }, [allTreatments]);

  const columns: ColumnDef<Treatment>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("gabinet.treatments.name")} />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.color && (
            <span
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: row.original.color }}
            />
          )}
          <span className="font-medium">{row.original.name}</span>
          {!row.original.isActive && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {t("common.inactive")}
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "category",
      header: t("gabinet.treatments.category"),
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{(getValue() as string) ?? "—"}</span>
      ),
      filterFn: (row, id, value) => (value as string[]).includes(row.getValue(id)),
    },
    {
      accessorKey: "duration",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("gabinet.treatments.duration")} />,
      cell: ({ getValue }) => `${getValue() as number} min`,
    },
    {
      accessorKey: "price",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("gabinet.treatments.price")} />,
      cell: ({ row }) => formatCurrency(row.original.price, row.original.currency ?? undefined),
    },
    {
      accessorKey: "taxRate",
      header: t("gabinet.treatments.taxRate"),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? `${v}%` : "—";
      },
    },
    {
      accessorKey: "isActive",
      header: t("common.active"),
      cell: ({ getValue }) => {
        const active = getValue() as boolean;
        return (
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              active ? "bg-green-500" : "bg-gray-300"
            }`}
          />
        );
      },
    },
  ];

  const openCreatePanel = () => {
    setEditingTreatment(null);
    setPanelOpen(true);
  };

  const openEditPanel = (treatment: Treatment) => {
    setEditingTreatment(treatment);
    setPanelOpen(true);
  };

  const handleSubmit = useCallback(
    async (formData: TreatmentFormData) => {
      setIsSubmitting(true);
      try {
        if (editingTreatment) {
          await updateTreatment({
            organizationId,
            treatmentId: editingTreatment._id,
            ...formData,
          });
        } else {
          await createTreatment({
            organizationId,
            ...formData,
          });
        }
        setPanelOpen(false);
        setEditingTreatment(null);
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingTreatment, createTreatment, updateTreatment, organizationId]
  );

  const rowActions = useCallback(
    (row: Treatment) => [
      {
        label: t("common.edit"),
        icon: <Pencil className="h-3.5 w-3.5" />,
        onClick: () => openEditPanel(row),
      },
      {
        label: row.isActive ? t("common.inactive") : t("common.active"),
        icon: <Power className="h-3.5 w-3.5" />,
        onClick: async () => {
          // Soft toggle by removing (deactivate) or updating
          if (row.isActive) {
            await removeTreatment({ organizationId, treatmentId: row._id });
          } else {
            await updateTreatment({
              organizationId,
              treatmentId: row._id,
              name: row.name,
            });
          }
        },
      },
      {
        label: t("common.delete"),
        icon: <Trash2 className="h-3.5 w-3.5" />,
        onClick: async () => {
          if (window.confirm(t("gabinet.treatments.confirmDelete"))) {
            await removeTreatment({ organizationId, treatmentId: row._id });
          }
        },
      },
    ],
    [t, removeTreatment, updateTreatment, organizationId]
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("gabinet.treatments.title")}
        description={t("gabinet.treatments.description")}
        actions={
          <Button onClick={openCreatePanel}>
            <Plus className="mr-2 h-4 w-4" />
            {t("gabinet.treatments.addTreatment")}
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

      <QuickActionBar
        actions={[
          {
            label: t('quickActions.newTreatment'),
            icon: <Plus className="mr-1.5 h-3.5 w-3.5" />,
            onClick: openCreatePanel,
            feature: "gabinet_treatments",
            action: "create",
          },
        ]}
      />

      {!isLoading && filteredTreatments.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title={t("gabinet.treatments.emptyTitle")}
          description={t("gabinet.treatments.emptyDescription")}
          action={
            <Button onClick={openCreatePanel}>
              <Plus className="mr-2 h-4 w-4" />
              {t("gabinet.treatments.addTreatment")}
            </Button>
          }
        />
      ) : (
        <CrmDataTable
          columns={columns}
          data={filteredTreatments}
          stickyFirstColumn
          searchKey="name"
          searchPlaceholder={t("gabinet.treatments.searchPlaceholder")}
          isLoading={isLoading}
          rowActions={rowActions}
          filterableColumns={categoryOptions.length > 0 ? [
            { id: "category", title: t("gabinet.treatments.category"), options: categoryOptions },
          ] : []}
        />
      )}

      <SidePanel
        open={panelOpen}
        onOpenChange={(open) => {
          setPanelOpen(open);
          if (!open) setEditingTreatment(null);
        }}
        title={editingTreatment ? t("common.edit") : t("gabinet.treatments.createTreatment")}
        description={editingTreatment ? undefined : t("gabinet.treatments.createDescription")}
      >
        <TreatmentForm
          key={editingTreatment?._id ?? "new"}
          initialData={
            editingTreatment
              ? {
                  name: editingTreatment.name,
                  description: editingTreatment.description ?? undefined,
                  category: editingTreatment.category ?? undefined,
                  duration: editingTreatment.duration,
                  price: editingTreatment.price,
                  currency: editingTreatment.currency ?? undefined,
                  taxRate: editingTreatment.taxRate ?? undefined,
                  requiredEquipment: editingTreatment.requiredEquipment ?? undefined,
                  contraindications: editingTreatment.contraindications ?? undefined,
                  preparationInstructions: editingTreatment.preparationInstructions ?? undefined,
                  aftercareInstructions: editingTreatment.aftercareInstructions ?? undefined,
                  requiresApproval: editingTreatment.requiresApproval ?? undefined,
                  color: editingTreatment.color ?? undefined,
                  sortOrder: editingTreatment.sortOrder ?? undefined,
                }
              : undefined
          }
          onSubmit={handleSubmit}
          onCancel={() => {
            setPanelOpen(false);
            setEditingTreatment(null);
          }}
          isSubmitting={isSubmitting}
        />
      </SidePanel>
    </div>
  );
}
