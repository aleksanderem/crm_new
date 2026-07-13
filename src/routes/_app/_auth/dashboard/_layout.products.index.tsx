import { useState, useMemo } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { getExpiryStatus } from "@/lib/expiry-utils";
import { useAction } from "convex/react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@cvx/_generated/api";
import {
  useSupabaseProductsList,
  useSupabaseUsedProductIds,
  useSupabaseProductStockTotals,
  useSupabaseProductLotBatches,
  type LotBatch,
} from "@/hooks/use-supabase-products";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable, useColumnVisibility, useAllColumns, type CrmColumn } from "@/components/crm/enhanced-data-table";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import { SidePanel } from "@/components/crm/side-panel";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Power, Upload, Download, X, Package, AlertTriangle, History, ClipboardList, Archive } from "@/lib/ez-icons";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useCsvExport } from "@/components/csv/csv-export-button";
import { CsvImportDialog } from "@/components/csv/csv-import-dialog";
import { ProductStockAdjustDialog } from "@/components/forms/product-stock-adjust-dialog";
import { ProductStockHistoryDialog } from "@/components/forms/product-stock-history-dialog";
import type { SavedView, FieldDef, FilterCondition } from "@/components/crm/types";
import { Id } from "@cvx/_generated/dataModel";
import type { MappedProduct } from "@/lib/supabase/mappers/products";
import { useSavedViews, applyFilterConditions } from "@/hooks/use-saved-views";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { TagsManagerSlideout } from "@/components/categories-tags/tags-manager-slideout";
import { CategoriesManagerSlideout } from "@/components/categories-tags/categories-manager-slideout";
import { formatActionError } from "@/lib/format-action-error";
import { cn } from "@/lib/utils";
import { ProductForm, type ProductFormData, type ProductSection, PRODUCT_SECTIONS } from "@/components/forms/product-form";
import { WarehouseInventoryDialog } from "@/components/gabinet/warehouse-inventory-dialog";
import { useSupabaseGabinetLocationsList } from "@/hooks/use-supabase-gabinet-locations";

type ProductsNudgeFilter = "unused" | "low_stock";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/products/"
)({
  component: ProductsPage,
  validateSearch: (
    search: Record<string, unknown>,
  ): { nudge?: ProductsNudgeFilter } => {
    const nudge =
      search.nudge === "unused" || search.nudge === "low_stock"
        ? (search.nudge as ProductsNudgeFilter)
        : undefined;
    return { nudge };
  },
});

type Product = MappedProduct;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
  }).format(amount);
}

// Returns the stock status for a product given its current total and min stock
type StockStatus = "ok" | "low" | "out" | "untracked";



function getStockStatus(
  trackStock: boolean | undefined,
  total: number,
  minStock: number | undefined,
): StockStatus {
  if (!trackStock) return "untracked";
  if (total <= 0) return "out";
  if (minStock != null && minStock > 0 && total < minStock) return "low";
  return "ok";
}

function StockBadge({ status, total, unit, minStock }: {
  status: StockStatus;
  total: number;
  unit?: string;
  minStock?: number;
}) {
  const { t } = useTranslation();
  const unitStr = unit?.trim() ? ` ${unit.trim()}` : "";

  if (status === "untracked") return <span className="text-muted-foreground">—</span>;

  const valueStr = `${total}${unitStr}`;

  if (status === "out") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-destructive font-medium">{valueStr}</span>
        <Badge variant="destructive" className="text-xs px-1.5 py-0">
          {t("products.stock.status.out", { defaultValue: "Brak" })}
        </Badge>
      </span>
    );
  }

  if (status === "low") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-amber-600 dark:text-amber-400 font-medium">{valueStr}</span>
        <Badge className="text-xs px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800">
          {t("products.stock.status.low", { defaultValue: "Niski" })}
          {minStock != null ? ` / min ${minStock}${unitStr}` : ""}
        </Badge>
      </span>
    );
  }

  // ok
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-emerald-600 dark:text-emerald-400 font-medium">{valueStr}</span>
    </span>
  );
}

// Small stats card used in the inventory summary widget
function StatCard({ label, value, highlight, active, onClick }: {
  label: string;
  value: number;
  highlight?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-0.5 rounded-lg border px-4 py-3 text-left transition-colors",
        onClick ? "cursor-pointer hover:bg-muted/50" : "cursor-default",
        active
          ? "border-primary ring-1 ring-primary bg-primary/5"
          : highlight
            ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
            : "bg-card",
      )}
    >
      <span className={cn(
        "text-xl font-semibold tabular-nums",
        active ? "text-primary" : highlight ? "text-amber-700 dark:text-amber-300" : "",
      )}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </button>
  );
}

function ProductsPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { nudge: nudgeFilter } = useSearch({ from: Route.id });
  const systemViews: SavedView[] = useMemo(() => [
    { id: "all", name: t('products.views.all'), isSystem: true, isDefault: true },
    { id: "active", name: t('products.views.active'), isSystem: true, isDefault: false },
  ], [t]);

  const {
    views, activeViewId, onViewChange, onCreateView, onDeleteView, applyFilters,
  } = useSavedViews({ organizationId, entityType: "product", systemViews });
  const [activeSection, setActiveSection] = useState<ProductSection | "all">(() => {
    try {
      const stored = localStorage.getItem("products:section");
      if (stored === "all" || (PRODUCT_SECTIONS as readonly string[]).includes(stored ?? "")) {
        return stored as ProductSection | "all";
      }
    } catch { /* ignore */ }
    return "all";
  });

  const handleSectionChange = (section: ProductSection | "all") => {
    setActiveSection(section);
    try { localStorage.setItem("products:section", section); } catch { /* ignore */ }
  };
  const [panelOpen, setPanelOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [savedViewsDialogOpen, setSavedViewsDialogOpen] = useState(false);
  const [filterSlideoutOpen, setFilterSlideoutOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [activeFilters, setActiveFilters] = useState<FilterCondition[]>([]);
  const { handleExport } = useCsvExport(organizationId, "products");
  const { tags } = useTagDefinitions(organizationId);
  const { categories } = useCategoryDefinitions(organizationId, "product");

  const filterableFields = useMemo((): FieldDef[] => [
    { id: "name", label: t('products.name'), type: "text" },
    { id: "sku", label: t('products.sku'), type: "text" },
    { id: "unitPrice", label: t('products.unitPrice'), type: "number" },
    { id: "taxRate", label: t('products.taxRate'), type: "number" },
    {
      id: "isActive", label: t('common.active'), type: "select",
      options: [
        { label: t('common.yes'), value: "true" },
        { label: t('common.no'), value: "false" },
      ],
    },
    { id: "createdAt", label: t('common.created'), type: "date" },
    { id: "tagIds", label: t('common.tags', { defaultValue: "Tagi" }), type: "multiSelect" as const, options: tags.map(tag => ({ label: tag.name, value: tag._id })) },
    { id: "categoryId", label: t('common.category', { defaultValue: "Kategoria" }), type: "select" as const, options: categories.map(cat => ({ label: cat.name, value: cat._id })) },
    { id: "manufacturer", label: t("products.manufacturer", { defaultValue: "Producent" }), type: "text" },
  ], [t, tags, categories]);
  const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);
  const [categoriesSlideoutOpen, setCategoriesSlideoutOpen] = useState(false);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);

  // Sidebar action dispatches
  useSidebarDispatch("importCsv", () => setImportOpen(true));
  useSidebarDispatch("exportCsv", () => handleExport());
  useSidebarDispatch("savedViews", () => setSavedViewsDialogOpen(true));
  useSidebarDispatch("openFilter", () => setFilterSlideoutOpen(true));
  useSidebarDispatch("manageTags", () => setTagsSlideoutOpen(true));
  useSidebarDispatch("manageCategories", () => setCategoriesSlideoutOpen(true));
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null);
  const [stockHistoryProduct, setStockHistoryProduct] = useState<Product | null>(null);
  const [lotBatchesProduct, setLotBatchesProduct] = useState<Product | null>(null);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const { data: allProducts = [], isLoading } = useSupabaseProductsList(organizationId);
  const { data: usedProductIds } = useSupabaseUsedProductIds(organizationId, {
    enabled: nudgeFilter === "unused",
  });
  const { totalsByProductId } = useSupabaseProductStockTotals(organizationId);
  const { data: locations = [] } = useSupabaseGabinetLocationsList(String(organizationId), { activeOnly: false });
  const { data: lotBatches = [], isLoading: lotBatchesLoading } = useSupabaseProductLotBatches(
    organizationId,
    lotBatchesProduct?._id ?? null,
    { enabled: !!lotBatchesProduct },
  );

  // Compute per-product stock status for filtering and display
  const productStockStatus = useMemo(() => {
    const map = new Map<string, StockStatus>();
    for (const p of allProducts) {
      const summary = totalsByProductId.get(p._id);
      const total = summary?.total ?? 0;
      map.set(p._id, getStockStatus(p.trackStock, total, p.minStock));
    }
    return map;
  }, [allProducts, totalsByProductId]);

  // Inventory summary stats
  const inventoryStats = useMemo(() => {
    const total = allProducts.length;
    const bySale = allProducts.filter(p => p.productSection === "sale").length;
    const byTreatment = allProducts.filter(p => p.productSection === "treatment").length;
    const byDisposable = allProducts.filter(p => p.productSection === "disposable").length;
    const belowMin = allProducts.filter(p => {
      const status = productStockStatus.get(p._id);
      return status === "low" || status === "out";
    }).length;
    return { total, bySale, byTreatment, byDisposable, belowMin };
  }, [allProducts, productStockStatus]);

  const products = useMemo(() => {
    let data = allProducts;
    if (activeViewId === "active") {
      data = allProducts.filter((p) => p.isActive);
    }
    if (nudgeFilter === "unused" && usedProductIds) {
      data = data.filter((p) => !usedProductIds.has(p._id));
    }
    if (nudgeFilter === "low_stock") {
      data = data.filter((p) => {
        const status = productStockStatus.get(p._id);
        return status === "low" || status === "out";
      });
    }
    if (activeSection !== "all") {
      data = data.filter((p) => p.productSection === activeSection);
    }
    data = applyFilters(data);
    data = applyFilterConditions(data, activeFilters);
    if (searchValue.trim()) {
      const q = searchValue.trim().toLowerCase();
      data = data.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.manufacturer?.toLowerCase().includes(q) ||
        p.catalogNumber?.toLowerCase().includes(q) ||
        p.stockNote?.toLowerCase().includes(q)
      );
    }
    return data;
  }, [activeViewId, allProducts, applyFilters, activeFilters, searchValue, nudgeFilter, usedProductIds, activeSection, productStockStatus]);

  const createProduct = useAction(api.products.create);
  const updateProduct = useAction(api.products.update);
  const removeProduct = useAction(api.products.remove);
  const toggleActive = useAction(api.products.toggleActive);

  // @ts-ignore — TS2589: deep type instantiation in Convex codegen
  const getPlannedUsage = useAction(api.gabinet.inventory.getPlannedUsage);
  const { data: plannedUsageData } = useQuery({
    queryKey: ["gabinet.inventory.getPlannedUsage", organizationId],
    queryFn: () => getPlannedUsage({ organizationId }),
    staleTime: 5 * 60 * 1000,
  });

  const plannedUsageByProductId = useMemo(() => {
    const map = new Map<string, { plannedUsage: number; unit: string; currentStock: number; deficit: number | null }>();
    for (const item of (plannedUsageData ?? []) as Array<{ productId: string; plannedUsage: number; unit: string; currentStock: number }>) {
      const existing = map.get(item.productId);
      if (existing) {
        existing.plannedUsage += item.plannedUsage;
        existing.currentStock += item.currentStock;
      } else {
        map.set(item.productId, {
          plannedUsage: item.plannedUsage,
          unit: item.unit,
          currentStock: item.currentStock,
          deficit: null,
        });
      }
    }
    for (const [, entry] of map) {
      const projected = entry.currentStock - entry.plannedUsage;
      entry.deficit = projected < 0 ? -projected : null;
    }
    return map;
  }, [plannedUsageData]);

  const productsWithDeficit = useMemo(() => {
    const nameMap = new Map<string, string>();
    for (const item of (plannedUsageData ?? []) as Array<{ productId: string; productName: string }>) {
      if (!nameMap.has(item.productId)) nameMap.set(item.productId, item.productName);
    }
    const result: Array<{ productId: string; productName: string; currentStock: number; plannedUsage: number; deficit: number; unit: string }> = [];
    for (const [productId, data] of plannedUsageByProductId) {
      if (data.deficit !== null && data.deficit > 0) {
        result.push({
          productId,
          productName: nameMap.get(productId) ?? productId,
          currentStock: data.currentStock,
          plannedUsage: data.plannedUsage,
          deficit: data.deficit,
          unit: data.unit,
        });
      }
    }
    result.sort((a, b) => b.deficit - a.deficit);
    return result;
  }, [plannedUsageData, plannedUsageByProductId]);

  const openCreatePanel = () => {
    setEditingProduct(null);
    setPanelOpen(true);
  };

  const openEditPanel = (product: Product) => {
    setEditingProduct(product);
    setPanelOpen(true);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleProductFormSubmit = async (data: ProductFormData) => {
    setIsSubmitting(true);
    try {
      if (editingProduct) {
        await updateProduct({
          organizationId,
          productId: editingProduct._id,
          name: data.name.trim(),
          sku: data.sku.trim(),
          unitPrice: data.unitPrice,
          taxRate: data.taxRate,
          taxExempt: data.taxExempt,
          description: data.description,
          tagIds: data.tagIds,
          categoryId: data.categoryId,
          trackStock: data.trackStock,
          stockUnit: data.stockUnit,
          productSection: data.productSection,
          minStock: data.minStock,
          manufacturer: data.manufacturer,
          catalogNumber: data.catalogNumber,
          stockNote: data.stockNote,
          purchasePrice: data.purchasePrice,
        });
      } else {
        await createProduct({
          organizationId,
          name: data.name.trim(),
          sku: data.sku.trim(),
          unitPrice: data.unitPrice,
          taxRate: data.taxRate,
          taxExempt: data.taxExempt,
          isActive: data.isActive,
          description: data.description,
          tagIds: data.tagIds,
          categoryId: data.categoryId,
          trackStock: data.trackStock,
          stockUnit: data.stockUnit,
          initialStock: data.initialStock,
          productSection: data.productSection,
          minStock: data.minStock,
          manufacturer: data.manufacturer,
          catalogNumber: data.catalogNumber,
          stockNote: data.stockNote,
          purchasePrice: data.purchasePrice,
        });
      }
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.products.list(organizationId) });
      toast.success(
        editingProduct
          ? t("products.success.updated", { defaultValue: "Produkt zaktualizowany." })
          : t("products.success.created", { defaultValue: "Produkt dodany." }),
      );
      setPanelOpen(false);
      setEditingProduct(null);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "products.errors.saveFailed",
          defaultValue: "Nie udało się zapisać produktu.",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await removeProduct({ organizationId, productId: deleteTarget.id });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.products.list(organizationId) });
      toast.success(t("products.success.deleted", { defaultValue: "Produkt usunięty." }));
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "products.errors.deleteFailed",
          defaultValue: "Nie udało się usunąć produktu.",
        }),
      );
    } finally {
      setDeleteTarget(null);
    }
  };

  const columns: CrmColumn<Product>[] = [
    {
      id: "name",
      label: t('common.name'),
      sortable: true,
      isRowHeader: true,
      render: (item) => <span className="font-medium">{item.name}</span>,
      getSortValue: (item) => item.name,
    },
    {
      id: "productSection",
      label: t("products.sections.label", { defaultValue: "Rodzaj produktu" }),
      render: (item) => {
        if (!item.productSection) return "—";
        return t(`products.sections.${item.productSection}`, { defaultValue: item.productSection });
      },
    },
    {
      id: "sku",
      label: t('products.sku'),
      render: (item) => item.sku ?? "—",
    },
    {
      id: "manufacturer",
      label: t("products.manufacturer", { defaultValue: "Producent" }),
      render: (item) => item.manufacturer ?? "—",
    },
    {
      id: "stock",
      label: t('products.stock.column', { defaultValue: "Stan" }),
      render: (item) => {
        if (!item.trackStock) return <span className="text-muted-foreground">—</span>;
        const summary = totalsByProductId.get(item._id);
        const total = summary?.total ?? 0;
        const status = productStockStatus.get(item._id) ?? "untracked";
        return (
          <StockBadge
            status={status}
            total={total}
            unit={item.stockUnit}
            minStock={item.minStock}
          />
        );
      },
      getSortValue: (item) => {
        if (!item.trackStock) return -Infinity;
        return totalsByProductId.get(item._id)?.total ?? 0;
      },
      sortable: true,
    },
    {
      id: "value",
      label: t("products.stock.valueColumn", { defaultValue: "Wartość" }),
      headerClassName: "whitespace-normal leading-tight",
      render: (item) => {
        if (!item.trackStock) return <span className="text-muted-foreground">—</span>;
        if (item.purchasePrice == null) {
          return <span className="text-muted-foreground">{t("inventory.accountantReport.noPrice", { defaultValue: "brak danych" })}</span>;
        }
        const qty = totalsByProductId.get(item._id)?.total ?? 0;
        return <span>{formatCurrency(qty * item.purchasePrice)}</span>;
      },
      getSortValue: (item) => {
        if (!item.trackStock || item.purchasePrice == null) return -Infinity;
        return (totalsByProductId.get(item._id)?.total ?? 0) * item.purchasePrice;
      },
      sortable: true,
    },
    {
      id: "plannedUsage",
      label: t("products.plannedUsage.column", { defaultValue: "Planowane 7 dni" }),
      headerClassName: "whitespace-normal leading-tight",
      render: (item) => {
        const usage = plannedUsageByProductId.get(item._id);
        if (!usage || usage.plannedUsage === 0) return <span>0</span>;
        const unit = usage.unit || item.stockUnit || "";
        const unitStr = unit.trim() ? ` ${unit.trim()}` : "";
        return (
          <div className="flex flex-col gap-0.5">
            <span>{usage.plannedUsage}{unitStr}</span>
            {usage.deficit !== null && (
              <span className="text-xs text-destructive">
                {t("products.plannedUsage.deficit", { amount: `${usage.deficit}${unitStr}`, defaultValue: `Brakuje: ${usage.deficit}${unitStr}` })}
              </span>
            )}
          </div>
        );
      },
      getSortValue: (item) => plannedUsageByProductId.get(item._id)?.plannedUsage ?? 0,
      sortable: true,
    },
    {
      id: "minStock",
      label: t("products.stock.minLabel", { defaultValue: "Min. stan" }),
      headerClassName: "whitespace-normal leading-tight",
      render: (item) => {
        if (!item.trackStock || item.minStock == null) return "—";
        const unit = item.stockUnit?.trim();
        return `${item.minStock}${unit ? ` ${unit}` : ""}`;
      },
      getSortValue: (item) => item.minStock ?? -Infinity,
      sortable: true,
    },
    {
      id: "catalogNumber",
      label: t("products.catalogNumber", { defaultValue: "Nr katalogowy" }),
      headerClassName: "whitespace-normal leading-tight",
      render: (item) => item.catalogNumber ?? "—",
    },
    {
      id: "unitPrice",
      label: t('products.unitPrice'),
      headerClassName: "whitespace-normal leading-tight",
      sortable: true,
      render: (item) => formatCurrency(item.unitPrice),
      getSortValue: (item) => item.unitPrice,
    },
    {
      id: "taxRate",
      label: t("products.taxRateShort", { defaultValue: "Stawka VAT (%)" }),
      headerClassName: "whitespace-normal leading-tight",
      render: (item) => {
        if (item.taxExempt) return "ZW";
        if (item.taxRate == null) return "—";
        return `${item.taxRate}%`;
      },
    },
    {
      id: "isActive",
      label: t('common.active'),
      render: (item) => item.isActive ? "✓" : "—",
    },
  ];

  const { allColumns, defaultHidden } = useAllColumns(columns, filterableFields);
  const { hiddenColumnIds, toggleColumn, setHiddenColumns } = useColumnVisibility(defaultHidden, "products");

  const rowActions = (row: Product) => {
    const actions = [
      {
        label: t('common.edit'),
        icon: <Pencil className="h-4 w-4" variant="stroke" />,
        onClick: () => openEditPanel(row),
      },
    ];
    if (row.trackStock) {
      actions.push({
        label: t("products.stock.receive.action", { defaultValue: "Przyjęcie magazynowe" }),
        icon: <Package className="h-4 w-4" variant="stroke" />,
        onClick: () => setStockAdjustProduct(row),
      });
      actions.push({
        label: t("products.stock.history.action", { defaultValue: "Historia operacji" }),
        icon: <History className="h-4 w-4" variant="stroke" />,
        onClick: () => setStockHistoryProduct(row),
      });
      actions.push({
        label: t("products.stock.lots.action", { defaultValue: "Partie" }),
        icon: <Archive className="h-4 w-4" variant="stroke" />,
        onClick: () => setLotBatchesProduct(row),
      });
    }
    actions.push(
      {
        label: row.isActive ? t('products.deactivate') : t('products.activate'),
        icon: <Power className="h-4 w-4" variant="stroke" />,
        onClick: async () => {
          try {
            await toggleActive({ organizationId, productId: row._id });
            void queryClient.invalidateQueries({ queryKey: supabaseKeys.products.list(organizationId) });
          } catch (e) {
            toast.error(
              formatActionError(e, t, {
                key: "products.errors.toggleFailed",
                defaultValue: "Nie udało się zmienić stanu aktywności.",
              }),
            );
          }
        },
      },
      {
        label: t('common.delete'),
        icon: <Trash2 className="h-4 w-4" variant="stroke" />,
        onClick: () => setDeleteTarget({ id: row._id, label: row.name }),
      },
    );
    return actions;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('products.title')}
        description={t('products.description')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setInventoryOpen(true)}>
              <ClipboardList className="mr-2 h-4 w-4" variant="stroke" />
              {t("inventory.startButton", { defaultValue: "Rozpocznij inwentaryzację" })}
            </Button>
            <Button onClick={openCreatePanel}>
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              {t('products.addProduct')}
            </Button>
          </div>
        }
      />

      {/* Inventory stats widget */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label={t("products.stats.total", { defaultValue: "Wszystkie pozycje" })}
          value={inventoryStats.total}
          active={activeSection === "all" && !nudgeFilter}
          onClick={() => handleSectionChange("all")}
        />
        <StatCard
          label={t("products.sections.sale")}
          value={inventoryStats.bySale}
          active={activeSection === "sale" && !nudgeFilter}
          onClick={() => handleSectionChange("sale")}
        />
        <StatCard
          label={t("products.sections.treatment")}
          value={inventoryStats.byTreatment}
          active={activeSection === "treatment" && !nudgeFilter}
          onClick={() => handleSectionChange("treatment")}
        />
        <StatCard
          label={t("products.sections.disposable")}
          value={inventoryStats.byDisposable}
          active={activeSection === "disposable" && !nudgeFilter}
          onClick={() => handleSectionChange("disposable")}
        />
        <StatCard
          label={t("products.stats.belowMin", { defaultValue: "Poniżej min. stanu" })}
          value={inventoryStats.belowMin}
          highlight={inventoryStats.belowMin > 0}
          active={nudgeFilter === "low_stock"}
          onClick={inventoryStats.belowMin > 0
            ? () => navigate({ to: "/dashboard/products", search: { nudge: "low_stock" } })
            : undefined}
        />
      </div>

      {productsWithDeficit.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" variant="stroke" />
            <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              {t("products.actionRequired.title", { defaultValue: "Produkty wymagające działania" })}
            </span>
          </div>
          <ul className="space-y-2">
            {productsWithDeficit.map((item) => {
              const unitStr = item.unit?.trim() ? ` ${item.unit.trim()}` : "";
              return (
                <li key={item.productId} className="text-sm text-amber-900 dark:text-amber-100">
                  <span className="font-medium">{item.productName}</span>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-amber-800 dark:text-amber-200">
                    <span>{t("products.actionRequired.stock", { defaultValue: "Stan:" })} {item.currentStock}{unitStr}</span>
                    <span>{t("products.actionRequired.planned", { defaultValue: "Planowane:" })} {item.plannedUsage}{unitStr}</span>
                    <span className="font-medium text-destructive">
                      {t("products.actionRequired.missing", { amount: `${item.deficit}${unitStr}`, defaultValue: `Brakuje: ${item.deficit}${unitStr}` })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {nudgeFilter === "unused" && (
        <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <span>
            {t("products.nudgeFilter.unused", {
              defaultValue:
                "Pokazywane są produkty nieużywane w żadnej transakcji.",
            })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() =>
              navigate({
                to: "/dashboard/products",
                search: { nudge: undefined },
              })
            }
          >
            <X className="h-3.5 w-3.5" variant="stroke" />
            {t("common.clearFilters")}
          </Button>
        </div>
      )}

      {nudgeFilter === "low_stock" && (
        <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" variant="stroke" />
            {t("products.nudgeFilter.lowStock", {
              defaultValue:
                "Pokazywane są pozycje poniżej minimalnego stanu magazynowego.",
            })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() =>
              navigate({
                to: "/dashboard/products",
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
        createDialogOpen={savedViewsDialogOpen}
        onCreateDialogOpenChange={setSavedViewsDialogOpen}
        filterSlideoutOpen={filterSlideoutOpen}
        onFilterSlideoutOpenChange={setFilterSlideoutOpen}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder={t('products.searchPlaceholder')}
        onTagsManage={() => setTagsSlideoutOpen(true)}
        onCategoriesManage={() => setCategoriesSlideoutOpen(true)}
        dropdownActions={[
          { label: t("csv.export"), icon: <Download className="h-4 w-4" variant="stroke" />, onClick: handleExport },
          { label: t("csv.import"), icon: <Upload className="h-4 w-4" variant="stroke" />, onClick: () => setImportOpen(true) },
        ]}
        onColumnSettingsOpen={() => setColumnSettingsOpen(true)}
        onFiltersChange={setActiveFilters}
      />

      <CrmDataTable
        columns={allColumns}
        hiddenColumnIds={hiddenColumnIds}
        data={products}
        rowActions={rowActions}
        isLoading={isLoading}
        onRowAction={(productId) => {
          const product = products.find((p) => p._id === productId);
          if (product) openEditPanel(product);
        }}
      />

      <CsvImportDialog
        organizationId={organizationId}
        entityType="products"
        open={importOpen}
        onOpenChange={setImportOpen}
      />

      <SidePanel
        open={columnSettingsOpen}
        onOpenChange={setColumnSettingsOpen}
        title={t("common.columnSettings", "Ustawienia kolumn")}
      >
        <div className="space-y-1 py-2">
          {allColumns
            .filter((col) => !["actions"].includes(col.id))
            .map((col) => {
              const isVisible = !hiddenColumnIds.has(col.id);
              return (
                <button
                  key={col.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => toggleColumn(col.id)}
                >
                  <Checkbox
                    checked={isVisible}
                    className="pointer-events-none"
                    aria-hidden
                  />
                  <span className="text-sm font-medium">{col.label ?? col.id}</span>
                </button>
              );
            })}
        </div>
      </SidePanel>

      <SidePanel
        open={panelOpen}
        onOpenChange={(open) => {
          setPanelOpen(open);
          if (!open) setEditingProduct(null);
        }}
        title={editingProduct ? t('products.editProduct') : t('products.newProduct')}
        description={editingProduct ? t('products.updateDescription') : t('products.createDescription')}
      >
        <ProductForm
          key={`${panelOpen}-${editingProduct?._id ?? "new"}`}
          initialData={editingProduct ? {
            name: editingProduct.name,
            sku: editingProduct.sku,
            description: editingProduct.description,
            unitPrice: editingProduct.unitPrice,
            taxRate: editingProduct.taxRate,
            taxExempt: editingProduct.taxExempt ?? false,
            isActive: editingProduct.isActive,
            tagIds: (editingProduct.tagIds as Id<"tagDefinitions">[]) ?? [],
            categoryId: (editingProduct.categoryId as Id<"categoryDefinitions">) ?? null,
            productSection: (editingProduct.productSection as ProductSection) ?? null,
            trackStock: !!editingProduct.trackStock,
            stockUnit: editingProduct.stockUnit ?? null,
            minStock: editingProduct.minStock ?? null,
            manufacturer: editingProduct.manufacturer ?? null,
            catalogNumber: editingProduct.catalogNumber ?? null,
            stockNote: editingProduct.stockNote ?? null,
            purchasePrice: editingProduct.purchasePrice ?? null,
          } : undefined}
          defaultSection={!editingProduct && activeSection !== "all" ? activeSection : null}
          onSubmit={handleProductFormSubmit}
          onCancel={() => {
            setPanelOpen(false);
            setEditingProduct(null);
          }}
          isSubmitting={isSubmitting}
          tagDefinitions={tags}
          categoryDefinitions={categories}
          organizationId={organizationId}
        />
      </SidePanel>

      <WarehouseInventoryDialog
        open={inventoryOpen}
        onOpenChange={setInventoryOpen}
        organizationId={organizationId}
        products={allProducts}
        totalsByProductId={totalsByProductId}
      />

      <ProductStockAdjustDialog
        open={!!stockAdjustProduct}
        onOpenChange={(open) => {
          if (!open) setStockAdjustProduct(null);
        }}
        organizationId={organizationId}
        product={stockAdjustProduct}
      />

      <ProductStockHistoryDialog
        open={!!stockHistoryProduct}
        onOpenChange={(open) => {
          if (!open) setStockHistoryProduct(null);
        }}
        organizationId={organizationId}
        product={stockHistoryProduct}
      />

      {/* LOT batches read-only panel (#2989) */}
      <SidePanel
        open={!!lotBatchesProduct}
        onOpenChange={(open) => {
          if (!open) setLotBatchesProduct(null);
        }}
        title={t("products.stock.lots.panelTitle", { defaultValue: "Aktywne partie (LOT)" })}
        description={lotBatchesProduct
          ? t("products.stock.lots.panelDesc", { name: lotBatchesProduct.name, defaultValue: `Partie produktu: ${lotBatchesProduct.name}` })
          : undefined
        }
      >
        {lotBatchesLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            {t("common.loading", "Ładowanie…")}
          </div>
        ) : lotBatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
            <Archive className="h-6 w-6 text-muted-foreground/40" variant="stroke" />
            <p className="text-sm text-muted-foreground">
              {t("products.stock.lots.empty", { defaultValue: "Brak aktywnych partii z numerem LOT." })}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {(lotBatches as LotBatch[]).map((batch, idx) => {
              const locationName = batch.locationId
                ? locations.find((l) => l._id === batch.locationId)?.name ?? batch.locationId
                : null;
              const unit = lotBatchesProduct?.stockUnit?.trim() ?? "";
              return (
                <div key={idx} className="rounded-md border px-4 py-3 text-sm space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">{batch.lotNumber}</div>
                    <div className="tabular-nums font-semibold shrink-0">
                      {batch.quantity}{unit ? ` ${unit}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {batch.expiryDate && (() => {
                      const expiryStatus = getExpiryStatus(batch.expiryDate);
                      const dateClass =
                        expiryStatus === "expired"
                          ? "text-destructive font-semibold"
                          : expiryStatus === "expiring_soon"
                            ? "text-amber-600 dark:text-amber-400 font-semibold"
                            : "text-foreground";
                      return (
                        <span className="flex flex-wrap items-center gap-1">
                          <span>{t("gabinet.deliveries.expiryDate", "Termin ważności")}:</span>
                          <span className={dateClass}>{batch.expiryDate}</span>
                          {expiryStatus === "expired" && (
                            <Badge variant="destructive" className="text-xs px-1.5 py-0 h-4">
                              {t("products.stock.lots.expired", "Po terminie")}
                            </Badge>
                          )}
                          {expiryStatus === "expiring_soon" && (
                            <Badge className="text-xs px-1.5 py-0 h-4 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                              {t("products.stock.lots.expiringSoon", "Ważność do 30 dni")}
                            </Badge>
                          )}
                        </span>
                      );
                    })()}
                    {locationName && (
                      <span>
                        {t("gabinet.deliveries.location", "Lokalizacja")}:{" "}
                        <span className="text-foreground">{locationName}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
        entityType="product"
        categories={categories}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("common.confirmDeleteDescription", { name: deleteTarget?.label })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
