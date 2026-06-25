import { useState, useMemo } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@cvx/_generated/api";
import {
  useSupabaseProductsList,
  useSupabaseUsedProductIds,
  useSupabaseProductStockTotals,
} from "@/hooks/use-supabase-products";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable, useColumnVisibility, useAllColumns, type CrmColumn } from "@/components/crm/enhanced-data-table";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import { SidePanel } from "@/components/crm/side-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Power, Upload, Download, X, Package, AlertTriangle, History } from "@/lib/ez-icons";
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
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
import { formatActionError } from "@/lib/format-action-error";
import { cn } from "@/lib/utils";

type ProductsNudgeFilter = "unused" | "low_stock";

const PRODUCT_SECTIONS = ["sale", "treatment", "disposable"] as const;
type ProductSection = (typeof PRODUCT_SECTIONS)[number];

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

// VAT-exempt ("zwolniony") is tracked as a separate boolean (taxExempt) on the
// product. The "zw" option is selected when the boolean is true; otherwise the
// numeric percentage is used.
const TAX_RATE_OPTIONS = [
  { value: "zw", label: "ZW" },
  { value: "0", label: "0%" },
  { value: "5", label: "5%" },
  { value: "8", label: "8%" },
  { value: "23", label: "23%" },
];

function initialTaxRateFormValue(
  taxRate: number | undefined | null,
  taxExempt: boolean | undefined | null,
): string {
  if (taxExempt) return "zw";
  if (taxRate == null) return "23";
  return String(taxRate);
}

function generateSku(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "PRD-";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

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
function StatCard({ label, value, highlight, onClick }: {
  label: string;
  value: number;
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-0.5 rounded-lg border px-4 py-3 text-left transition-colors",
        onClick ? "cursor-pointer hover:bg-muted/50" : "cursor-default",
        highlight ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : "bg-card",
      )}
    >
      <span className={cn(
        "text-xl font-semibold tabular-nums",
        highlight ? "text-amber-700 dark:text-amber-300" : "",
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [taxRate, setTaxRate] = useState("23");
  const [isActive, setIsActive] = useState(true);
  const [description, setDescription] = useState("");
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>([]);
  const [categoryId, setCategoryId] = useState<Id<"categoryDefinitions"> | undefined>(undefined);
  // Inventory (#1700 PR-A)
  const [trackStock, setTrackStock] = useState(false);
  const [stockUnit, setStockUnit] = useState("");
  const [initialStock, setInitialStock] = useState("");
  const [productSection, setProductSection] = useState<ProductSection | "">("");
  // New warehouse fields (#2052)
  const [minStock, setMinStock] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [catalogNumber, setCatalogNumber] = useState("");
  const [stockNote, setStockNote] = useState("");

  const { data: allProducts = [], isLoading } = useSupabaseProductsList(organizationId);
  const { data: usedProductIds } = useSupabaseUsedProductIds(organizationId, {
    enabled: nudgeFilter === "unused",
  });
  const { totalsByProductId } = useSupabaseProductStockTotals(organizationId);

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

  const resetForm = () => {
    setName("");
    setSku(generateSku());
    setUnitPrice("");
    setTaxRate("23");
    setIsActive(true);
    setDescription("");
    setTagIds([]);
    setCategoryId(undefined);
    setTrackStock(false);
    setStockUnit("");
    setInitialStock("");
    setProductSection(activeSection !== "all" ? activeSection : "");
    setMinStock("");
    setManufacturer("");
    setCatalogNumber("");
    setStockNote("");
    setEditingProduct(null);
  };

  const openCreatePanel = () => {
    resetForm();
    setPanelOpen(true);
  };

  const openEditPanel = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setSku(product.sku);
    setUnitPrice(String(product.unitPrice));
    setTaxRate(initialTaxRateFormValue(product.taxRate, product.taxExempt));
    setIsActive(product.isActive);
    setDescription(product.description ?? "");
    setTagIds((product.tagIds as Id<"tagDefinitions">[]) ?? []);
    setCategoryId(product.categoryId as Id<"categoryDefinitions"> | undefined);
    setTrackStock(!!product.trackStock);
    setStockUnit(product.stockUnit ?? "");
    setInitialStock("");
    setProductSection((product.productSection as ProductSection | undefined) ?? "");
    setMinStock(product.minStock != null ? String(product.minStock) : "");
    setManufacturer(product.manufacturer ?? "");
    setCatalogNumber(product.catalogNumber ?? "");
    setStockNote(product.stockNote ?? "");
    setPanelOpen(true);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !sku.trim() || !unitPrice) return;
    setIsSubmitting(true);
    const isExempt = taxRate === "zw";
    const numericTaxRate = !isExempt
      ? Number.isFinite(parseFloat(taxRate))
        ? parseFloat(taxRate)
        : null
      : null;
    const normalizedUnitPrice = unitPrice.replace(",", ".");
    const normalizedStockUnit = stockUnit.trim() || null;
    const normalizedInitialStock = (() => {
      if (!initialStock.trim()) return null;
      const parsed = parseFloat(initialStock.replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    })();
    const normalizedMinStock = (() => {
      if (!minStock.trim()) return null;
      const parsed = parseFloat(minStock.replace(",", "."));
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    })();
    const normalizedSection = productSection || null;
    try {
      if (editingProduct) {
        await updateProduct({
          organizationId,
          productId: editingProduct._id,
          name: name.trim(),
          sku: sku.trim(),
          unitPrice: parseFloat(normalizedUnitPrice),
          taxRate: numericTaxRate,
          taxExempt: isExempt,
          description: description.trim() || null,
          tagIds,
          categoryId: categoryId ?? null,
          trackStock,
          stockUnit: normalizedStockUnit,
          productSection: normalizedSection,
          minStock: normalizedMinStock,
          manufacturer: manufacturer.trim() || null,
          catalogNumber: catalogNumber.trim() || null,
          stockNote: stockNote.trim() || null,
        });
      } else {
        await createProduct({
          organizationId,
          name: name.trim(),
          sku: sku.trim(),
          unitPrice: parseFloat(normalizedUnitPrice),
          taxRate: numericTaxRate,
          taxExempt: isExempt,
          isActive,
          description: description.trim() || null,
          tagIds,
          categoryId: categoryId ?? null,
          trackStock,
          stockUnit: normalizedStockUnit,
          initialStock: normalizedInitialStock,
          productSection: normalizedSection,
          minStock: normalizedMinStock,
          manufacturer: manufacturer.trim() || null,
          catalogNumber: catalogNumber.trim() || null,
          stockNote: stockNote.trim() || null,
        });
      }
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.products.list(organizationId) });
      toast.success(
        editingProduct
          ? t("products.success.updated", { defaultValue: "Produkt zaktualizowany." })
          : t("products.success.created", { defaultValue: "Produkt dodany." }),
      );
      setPanelOpen(false);
      resetForm();
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
      label: t("products.sections.label", { defaultValue: "Sekcja" }),
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
      id: "minStock",
      label: t("products.stock.minLabel", { defaultValue: "Min. stan" }),
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
      render: (item) => item.catalogNumber ?? "—",
    },
    {
      id: "unitPrice",
      label: t('products.unitPrice'),
      sortable: true,
      render: (item) => formatCurrency(item.unitPrice),
      getSortValue: (item) => item.unitPrice,
    },
    {
      id: "taxRate",
      label: t('products.taxRate'),
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
          <Button onClick={openCreatePanel}>
            <Plus className="mr-2 h-4 w-4" variant="stroke" />
            {t('products.addProduct')}
          </Button>
        }
      />

      {/* Inventory stats widget */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label={t("products.stats.total", { defaultValue: "Wszystkie pozycje" })}
          value={inventoryStats.total}
        />
        <StatCard
          label={t("products.sections.sale")}
          value={inventoryStats.bySale}
          onClick={() => handleSectionChange("sale")}
        />
        <StatCard
          label={t("products.sections.treatment")}
          value={inventoryStats.byTreatment}
          onClick={() => handleSectionChange("treatment")}
        />
        <StatCard
          label={t("products.sections.disposable")}
          value={inventoryStats.byDisposable}
          onClick={() => handleSectionChange("disposable")}
        />
        <StatCard
          label={t("products.stats.belowMin", { defaultValue: "Poniżej min. stanu" })}
          value={inventoryStats.belowMin}
          highlight={inventoryStats.belowMin > 0}
          onClick={inventoryStats.belowMin > 0
            ? () => navigate({ to: "/dashboard/products", search: { nudge: "low_stock" } })
            : undefined}
        />
      </div>

      <Tabs value={activeSection} onValueChange={(v) => handleSectionChange(v as ProductSection | "all")}>
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="all">
              {t("products.sections.all", { defaultValue: "Wszystkie" })}
            </TabsTrigger>
            {PRODUCT_SECTIONS.map((section) => (
              <TabsTrigger key={section} value={section}>
                {t(`products.sections.${section}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

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
        columnDefs={allColumns.map(c => ({ id: c.id, label: c.label ?? c.id }))}
        hiddenColumnIds={hiddenColumnIds}
        onToggleColumn={toggleColumn}
        onSetHiddenColumns={setHiddenColumns}
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
        open={panelOpen}
        onOpenChange={(open) => {
          setPanelOpen(open);
          if (!open) resetForm();
        }}
        title={editingProduct ? t('products.editProduct') : t('products.newProduct')}
        description={editingProduct ? t('products.updateDescription') : t('products.createDescription')}
        onSubmit={handleSubmit}
        submitLabel={editingProduct ? t('common.update') : t('common.create')}
        isSubmitting={isSubmitting}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              {t('common.name')} <span className="text-destructive">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('products.productName')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              {t('products.sku')} <span className="text-destructive">*</span>
            </Label>
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="PRD-XXXXXX"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("products.sections.label", { defaultValue: "Sekcja" })}</Label>
            <Select value={productSection || "none"} onValueChange={(v) => setProductSection(v === "none" ? "" : v as ProductSection)}>
              <SelectTrigger>
                <SelectValue placeholder={t("products.sections.placeholder", { defaultValue: "Wybierz sekcję" })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("products.sections.none", { defaultValue: "Bez sekcji" })}</SelectItem>
                {PRODUCT_SECTIONS.map((section) => (
                  <SelectItem key={section} value={section}>
                    {t(`products.sections.${section}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                {t('products.unitPrice')} <span className="text-destructive">*</span>
              </Label>
              <Input
                type="text"
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                    setUnitPrice(v);
                  }
                }}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t('products.taxRate')}</Label>
              <Select value={taxRate} onValueChange={setTaxRate}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAX_RATE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!editingProduct && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(!!checked)}
              />
              <Label className="cursor-pointer">{t('common.active')}</Label>
            </div>
          )}

          {/* Manufacturer & catalog number */}
          <div className="grid gap-3 grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("products.manufacturer", { defaultValue: "Producent" })}</Label>
              <Input
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder={t("products.manufacturerPlaceholder", { defaultValue: "Nazwa producenta" })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("products.catalogNumber", { defaultValue: "Nr katalogowy" })}</Label>
              <Input
                value={catalogNumber}
                onChange={(e) => setCatalogNumber(e.target.value)}
                placeholder={t("products.catalogNumberPlaceholder", { defaultValue: "np. CAT-12345" })}
              />
            </div>
          </div>

          {/* Stock tracking */}
          <div className="space-y-3 rounded-md border bg-muted/30 px-3 py-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="product-track-stock"
                checked={trackStock}
                onCheckedChange={(checked) => setTrackStock(!!checked)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="product-track-stock" className="cursor-pointer">
                  {t("products.stock.trackToggle", {
                    defaultValue: "Śledź stan magazynowy",
                  })}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("products.stock.trackHelp", {
                    defaultValue:
                      "Każda zmiana stanu zapisuje się w historii ruchów. Jeśli wyłączone, historia może być nadal prowadzona ręcznie, ale stan nie jest pilnowany.",
                  })}
                </p>
              </div>
            </div>

            {trackStock && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>
                      {t("products.stock.unitLabel", { defaultValue: "Jednostka" })}
                    </Label>
                    <Input
                      value={stockUnit}
                      onChange={(e) => setStockUnit(e.target.value)}
                      placeholder={t("products.stock.unitPlaceholder", {
                        defaultValue: "szt., ml, g…",
                      })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      {t("products.stock.minLabel", { defaultValue: "Min. stan" })}
                    </Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={minStock}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                          setMinStock(v);
                        }
                      }}
                      placeholder="0"
                    />
                  </div>
                </div>
                {!editingProduct && (
                  <div className="space-y-1.5">
                    <Label>
                      {t("products.stock.initialLabel", {
                        defaultValue: "Stan początkowy",
                      })}
                    </Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={initialStock}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^-?[0-9]*[.,]?[0-9]*$/.test(v)) {
                          setInitialStock(v);
                        }
                      }}
                      placeholder="0"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Warehouse note */}
          <div className="space-y-1.5">
            <Label>{t("products.stock.noteLabel", { defaultValue: "Notatka magazynowa" })}</Label>
            <Textarea
              value={stockNote}
              onChange={(e) => setStockNote(e.target.value)}
              placeholder={t("products.stock.notePlaceholder", {
                defaultValue: "Warunki przechowywania, uwagi dla magazyniera…",
              })}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('common.description')}</Label>
            <RichTextEditor
              value={description}
              onChange={(val) => setDescription(val ?? "")}
              placeholder={t('products.productDescription')}
              minHeight="80px"
            />
          </div>

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
              entityType="product"
            />
          </div>
        </div>
      </SidePanel>

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
