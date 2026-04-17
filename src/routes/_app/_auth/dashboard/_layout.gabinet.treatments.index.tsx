import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useSupabaseGabinetTreatmentsList } from "@/hooks/use-supabase-gabinet-treatments";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable, useColumnVisibility, useAllColumns } from "@/components/crm/enhanced-data-table";
import type { CrmColumn } from "@/components/crm/enhanced-data-table";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import { SidePanel } from "@/components/crm/side-panel";
import { TreatmentForm } from "@/components/gabinet/treatment-form";
import type { TreatmentFormData } from "@/components/gabinet/treatment-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Power } from "@/lib/ez-icons";
import type { SavedView, FieldDef, FilterCondition } from "@/components/crm/types";
import { Doc, Id } from "@cvx/_generated/dataModel";
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSavedViews, applyFilterConditions } from "@/hooks/use-saved-views";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { TagsManagerSlideout } from "@/components/categories-tags/tags-manager-slideout";
import { CategoriesManagerSlideout } from "@/components/categories-tags/categories-manager-slideout";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";

// shadcn/studio statistics blocks
import StatisticsOrderCard from "@/components/shadcn-studio/blocks/statistics-order-card";
import StatisticsProfitCard from "@/components/shadcn-studio/blocks/statistics-profit-card";
import StatisticsSalesGrowthCard from "@/components/shadcn-studio/blocks/statistics-sales-growth-card";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/treatments/",
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
  const navigate = useNavigate();
  const createTreatment = useMutation(api.gabinet.treatments.create);
  const updateTreatment = useMutation(api.gabinet.treatments.update);
  const removeTreatment = useMutation(api.gabinet.treatments.remove);

  const { tags } = useTagDefinitions(organizationId);
  const { categories } = useCategoryDefinitions(organizationId, "gabinetTreatment");
  const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);
  const [categoriesSlideoutOpen, setCategoriesSlideoutOpen] = useState(false);

  useSidebarDispatch("manageTags", () => setTagsSlideoutOpen(true));
  useSidebarDispatch("manageCategories", () => setCategoriesSlideoutOpen(true));

  const { data: kpis } = useQuery(
    convexQuery(api.gabinet.sidebarWidgets.getTreatmentsKpis, { organizationId })
  );

  const { data: topTreatments } = useQuery(
    convexQuery(api.gabinet.sidebarWidgets.getTopTreatments, { organizationId })
  );

  // Build sparkline from top treatments data
  const treatmentChartData = useMemo(() => {
    if (!topTreatments?.length) return undefined;
    return topTreatments.slice(0, 7).map((item) => ({
      day: item.label.slice(0, 8),
      orders: item.value,
    }));
  }, [topTreatments]);

  const [activeFilters, setActiveFilters] = useState<FilterCondition[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingTreatment, setEditingTreatment] = useState<Treatment | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>([]);
  const [categoryId, setCategoryId] = useState<Id<"categoryDefinitions"> | undefined>(undefined);

  const systemViews = useMemo(
    (): SavedView[] => [
      {
        id: "all",
        name: t("gabinet.treatments.views.all"),
        isSystem: true,
        isDefault: true,
      },
      {
        id: "active",
        name: t("gabinet.treatments.views.active"),
        isSystem: true,
        isDefault: false,
      },
      {
        id: "inactive",
        name: t("gabinet.treatments.views.inactive"),
        isSystem: true,
        isDefault: false,
      },
    ],
    [t],
  );

  const filterableFields = useMemo(
    (): FieldDef[] => [
      { id: "name", label: t("gabinet.treatments.name"), type: "text" },
      { id: "category", label: t("gabinet.treatments.category"), type: "text" },
      { id: "price", label: t("gabinet.treatments.price"), type: "number" },
      { id: "duration", label: t("gabinet.treatments.duration"), type: "number" },
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

  const { data: allTreatments = [], isLoading } = useSupabaseGabinetTreatmentsList(organizationId);

  const {
    views,
    activeViewId,
    onViewChange,
    onCreateView,
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
    data = applyFilters(data);
    data = applyFilterConditions(data, activeFilters);
    if (searchValue.trim()) {
      const q = searchValue.trim().toLowerCase();
      data = data.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.category && t.category.toLowerCase().includes(q)),
      );
    }
    return data;
  }, [allTreatments, activeViewId, applyFilters, activeFilters, searchValue]);

  const columns: CrmColumn<Treatment>[] = useMemo(
    () => [
      {
        id: "name",
        label: t("gabinet.treatments.name"),
        sortable: true,
        isRowHeader: true,
        render: (item) => (
          <div className="flex items-center gap-2">
            {item.color && (
              <span
                className="h-4 w-4 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
            )}
            <Link
              to="/dashboard/gabinet/treatments/$treatmentId"
              params={{ treatmentId: item._id }}
              className="font-medium text-fg-primary hover:text-brand-secondary"
            >
              {item.name}
            </Link>
            {!item.isActive && (
              <Badge variant="outline" className="text-xs text-fg-quaternary">
                {t("common.inactive")}
              </Badge>
            )}
          </div>
        ),
        getSortValue: (item) => item.name,
      },
      {
        id: "category",
        label: t("gabinet.treatments.category"),
        sortable: true,
        render: (item) => item.category ?? "—",
        getSortValue: (item) => item.category ?? "",
      },
      {
        id: "duration",
        label: t("gabinet.treatments.duration"),
        sortable: true,
        render: (item) => `${item.duration} min`,
        getSortValue: (item) => item.duration,
      },
      {
        id: "price",
        label: t("gabinet.treatments.price"),
        sortable: true,
        render: (item) => formatCurrency(item.price, item.currency ?? undefined),
        getSortValue: (item) => item.price,
      },
      {
        id: "taxRate",
        label: t("gabinet.treatments.taxRate"),
        render: (item) => (item.taxRate != null ? `${item.taxRate}%` : "—"),
      },
      {
        id: "isActive",
        label: t("common.active"),
        render: (item) => (
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              item.isActive ? "bg-green-500" : "bg-gray-300"
            }`}
          />
        ),
      },
    ],
    [t],
  );

  const { allColumns, defaultHidden } = useAllColumns(columns, filterableFields);
  const { hiddenColumnIds, toggleColumn, setHiddenColumns } = useColumnVisibility(defaultHidden, "gabinet-treatments");

  const openCreatePanel = () => {
    setEditingTreatment(null);
    setTagIds([]);
    setCategoryId(undefined);
    setPanelOpen(true);
  };

  const openEditPanel = (treatment: Treatment) => {
    setEditingTreatment(treatment);
    setTagIds((treatment.tagIds as Id<"tagDefinitions">[]) ?? []);
    setCategoryId(treatment.categoryId as Id<"categoryDefinitions"> | undefined);
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
            tagIds,
            categoryId,
          });
        } else {
          await createTreatment({
            organizationId,
            ...formData,
            tagIds,
            categoryId,
          });
        }
        setPanelOpen(false);
        setEditingTreatment(null);
        setTagIds([]);
        setCategoryId(undefined);
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingTreatment, createTreatment, updateTreatment, organizationId, tagIds, categoryId],
  );

  const handleBulkAction = useCallback(
    async (action: string, selectedRows: Treatment[]) => {
      if (action === "delete") {
        for (const row of selectedRows) {
          await removeTreatment({ organizationId, treatmentId: row._id });
        }
      }
    },
    [removeTreatment, organizationId],
  );

  const rowActions = useCallback(
    (row: Treatment) => [
      {
        label: t("common.edit"),
        icon: <Pencil className="h-4 w-4" variant="stroke" />,
        onClick: () => openEditPanel(row),
      },
      {
        label: row.isActive ? t("common.inactive") : t("common.active"),
        icon: <Power className="h-4 w-4" variant="stroke" />,
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
        icon: <Trash2 className="h-4 w-4" variant="stroke" />,
        onClick: async () => {
          if (window.confirm(t("gabinet.treatments.confirmDelete"))) {
            await removeTreatment({ organizationId, treatmentId: row._id });
          }
        },
      },
    ],
    [t, removeTreatment, updateTreatment, organizationId],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("gabinet.treatments.title")}
        description={t("gabinet.treatments.description")}
        actions={
          <Button onClick={openCreatePanel}>
            <Plus className="mr-2 h-4 w-4" variant="stroke" />
            {t("gabinet.treatments.addTreatment")}
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
        searchPlaceholder={t("gabinet.treatments.searchPlaceholder")}
        columnDefs={allColumns.map(c => ({ id: c.id, label: c.label ?? c.id }))}
        hiddenColumnIds={hiddenColumnIds}
        onToggleColumn={toggleColumn}
        onSetHiddenColumns={setHiddenColumns}
        onTagsManage={() => setTagsSlideoutOpen(true)}
        onCategoriesManage={() => setCategoriesSlideoutOpen(true)}
        onFiltersChange={setActiveFilters}
      />

      {/* KPI Statistics Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatisticsOrderCard
          title={t("gabinet.treatments.totalTreatments", "Zabiegi")}
          description={t("gabinet.treatments.inCatalog", "W katalogu")}
          value={String(kpis?.totalTreatments ?? 0)}
          changePercentage={
            kpis?.popularTreatment
              ? `★ ${kpis.popularTreatment}`
              : ""
          }
          chartData={treatmentChartData}
        />
        <StatisticsProfitCard
          title={t("gabinet.treatments.completedThisMonth", "Wykonane w tym mies.")}
          description={t("gabinet.treatments.thisMonth", "Ten miesiąc")}
          value={String(kpis?.completedThisMonth ?? 0)}
          changePercentage={t("gabinet.treatments.appointments", "wizyt")}
        />
        <StatisticsSalesGrowthCard
          title={t("gabinet.treatments.popular", "Najpopularniejszy")}
          description={t("gabinet.treatments.byAppointments", "Wg wizyt")}
          value={kpis?.popularTreatment ?? "—"}
          changePercentage={
            kpis?.completedThisMonth
              ? `${kpis.completedThisMonth} ${t("gabinet.treatments.thisMonthShort", "w tym mies.")}`
              : ""
          }
          gradientId="fillTreatments"
        />
      </div>

      <CrmDataTable
        columns={allColumns}
        data={filteredTreatments}
        isLoading={isLoading}
        hiddenColumnIds={hiddenColumnIds}
        enableBulkSelect
        bulkActions={[
          {
            label: t("common.delete"),
            value: "delete",
            variant: "destructive",
          },
        ]}
        onBulkAction={handleBulkAction}
        rowActions={rowActions}
        onRowAction={(id) => navigate({ to: '/dashboard/gabinet/treatments/$treatmentId', params: { treatmentId: id } })}
        emptyTitle={t("gabinet.treatments.emptyTitle")}
        emptyDescription={t("gabinet.treatments.emptyDescription")}
      />

      <SidePanel
        open={panelOpen}
        onOpenChange={(open) => {
          setPanelOpen(open);
          if (!open) {
            setEditingTreatment(null);
            setTagIds([]);
            setCategoryId(undefined);
          }
        }}
        title={
          editingTreatment
            ? t("common.edit")
            : t("gabinet.treatments.createTreatment")
        }
        description={
          editingTreatment
            ? undefined
            : t("gabinet.treatments.createDescription")
        }
      >
        <TreatmentForm
          key={editingTreatment?._id ?? "new"}
          organizationId={organizationId}
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
                  requiredEquipment:
                    editingTreatment.requiredEquipment ?? undefined,
                  requiredEquipmentIds:
                    editingTreatment.requiredEquipmentIds ?? undefined,
                  contraindications:
                    editingTreatment.contraindications ?? undefined,
                  preparationInstructions:
                    editingTreatment.preparationInstructions ?? undefined,
                  aftercareInstructions:
                    editingTreatment.aftercareInstructions ?? undefined,
                  requiresApproval:
                    editingTreatment.requiresApproval ?? undefined,
                  color: editingTreatment.color ?? undefined,
                  sortOrder: editingTreatment.sortOrder ?? undefined,
                  treatmentCount: editingTreatment.treatmentCount ?? undefined,
                }
              : undefined
          }
          onSubmit={handleSubmit}
          onCancel={() => {
            setPanelOpen(false);
            setEditingTreatment(null);
          }}
          isSubmitting={isSubmitting}
        >
          {tags.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t('common.tags', { defaultValue: "Tagi" })}</Label>
              <TagsPicker tags={tags} selectedIds={tagIds} onChange={setTagIds} />
            </div>
          )}
          {categories.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t('common.category', { defaultValue: "Kategoria" })}</Label>
              <CategoryPicker categories={categories} selectedId={categoryId} onChange={setCategoryId} />
            </div>
          )}
        </TreatmentForm>
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
        entityType="gabinetTreatment"
        categories={categories}
      />
    </div>
  );
}
