import { useState, useMemo, useEffect, type ReactNode } from "react";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { formatActionError } from "@/lib/format-action-error";
import { cn } from "@/lib/utils";
import { ProductForm, type ProductFormData, type ProductSection, PRODUCT_SECTIONS } from "@/components/forms/product-form";

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

type SimpleFiltersState = {
  productSection: string | null;
  categoryId: string | null;
  manufacturer: string | null;
  isActive: "true" | "false" | null;
  stockFilter: "below_min" | "zero" | "gt" | "lt" | null;
  stockValue: string;
  priceFrom: string;
  priceTo: string;
};

const EMPTY_SIMPLE_FILTERS: SimpleFiltersState = {
  productSection: null,
  categoryId: null,
  manufacturer: null,
  isActive: null,
  stockFilter: null,
  stockValue: "",
  priceFrom: "",
  priceTo: "",
};

function hasAnySimpleFilter(f: SimpleFiltersState): boolean {
  return (
    f.productSection !== null ||
    f.categoryId !== null ||
    f.manufacturer !== null ||
    f.isActive !== null ||
    f.stockFilter !== null ||
    f.priceFrom !== "" ||
    f.priceTo !== ""
  );
}

function FilterChip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium">
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 rounded hover:bg-muted"
        aria-label="Usuń filtr"
      >
        <X className="h-3 w-3" variant="stroke" />
      </button>
    </span>
  );
}

function ProductSimpleFilterPanel({
  open,
  onOpenChange,
  filters,
  onApply,
  categories,
  manufacturers,
  onOpenAdvanced,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: SimpleFiltersState;
  onApply: (f: SimpleFiltersState) => void;
  categories: Array<{ _id: string; name: string }>;
  manufacturers: string[];
  onOpenAdvanced: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<SimpleFiltersState>(EMPTY_SIMPLE_FILTERS);

  useEffect(() => {
    if (open) setDraft(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hasAny = hasAnySimpleFilter(draft);

  const handleApply = () => {
    onApply(draft);
    onOpenChange(false);
  };

  const handleClear = () => {
    setDraft(EMPTY_SIMPLE_FILTERS);
    onApply(EMPTY_SIMPLE_FILTERS);
    onOpenChange(false);
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={t("products.simpleFilter.title", { defaultValue: "Filtruj produkty" })}
      description={t("products.simpleFilter.description", { defaultValue: "Wybierz filtry, aby zawęzić listę produktów." })}
    >
      <div className="space-y-5">
        {/* productSection */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">
            {t("products.simpleFilter.section.label", { defaultValue: "Pokaż produkty z grupy" })}
          </Label>
          <RadioGroup
            value={draft.productSection ?? ""}
            onValueChange={(v) => setDraft(d => ({ ...d, productSection: v || null }))}
            className="space-y-2"
          >
            {([
              ["", t("products.simpleFilter.section.all", { defaultValue: "Wszystkie grupy" })],
              ["sale", t("products.sections.sale")],
              ["treatment", t("products.sections.treatment")],
              ["disposable", t("products.sections.disposable")],
            ] as [string, string][]).map(([value, label]) => (
              <div key={value || "all"} className="flex items-center gap-2">
                <RadioGroupItem value={value} id={`sf-section-${value || "all"}`} />
                <label htmlFor={`sf-section-${value || "all"}`} className="cursor-pointer text-sm leading-none">
                  {label}
                </label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="h-px bg-border" />

        {/* categoryId */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">
            {t("products.simpleFilter.category.label", { defaultValue: "Pokaż produkty z kategorii" })}
          </Label>
          {categories.length > 0 ? (
            <Select
              value={draft.categoryId ?? "all"}
              onValueChange={(v) => setDraft(d => ({ ...d, categoryId: v === "all" ? null : v }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={t("products.simpleFilter.category.all", { defaultValue: "Wszystkie kategorie" })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("products.simpleFilter.category.all", { defaultValue: "Wszystkie kategorie" })}
                </SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat._id} value={cat._id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("products.simpleFilter.category.empty", { defaultValue: "Brak zdefiniowanych kategorii." })}
            </p>
          )}
        </div>

        <div className="h-px bg-border" />

        {/* manufacturer */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">
            {t("products.simpleFilter.manufacturer.label", { defaultValue: "Pokaż produkty od dostawcy" })}
          </Label>
          {manufacturers.length > 0 ? (
            <Select
              value={draft.manufacturer ?? "all"}
              onValueChange={(v) => setDraft(d => ({ ...d, manufacturer: v === "all" ? null : v }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={t("products.simpleFilter.manufacturer.all", { defaultValue: "Wszyscy dostawcy" })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("products.simpleFilter.manufacturer.all", { defaultValue: "Wszyscy dostawcy" })}
                </SelectItem>
                {manufacturers.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("products.simpleFilter.manufacturer.empty", { defaultValue: "Brak dostawców w produktach." })}
            </p>
          )}
        </div>

        <div className="h-px bg-border" />

        {/* stockFilter */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">
            {t("products.simpleFilter.stock.label", { defaultValue: "Pokaż produkty" })}
          </Label>
          <RadioGroup
            value={draft.stockFilter ?? ""}
            onValueChange={(v) => {
              const val = v as SimpleFiltersState["stockFilter"] | "";
              setDraft(d => ({
                ...d,
                stockFilter: val || null,
                stockValue: val !== "gt" && val !== "lt" ? "" : d.stockValue,
              }));
            }}
            className="space-y-2"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="" id="sf-stock-all" />
              <label htmlFor="sf-stock-all" className="cursor-pointer text-sm leading-none">
                {t("products.simpleFilter.stock.all", { defaultValue: "wszystkie stany" })}
              </label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="below_min" id="sf-stock-below-min" />
              <label htmlFor="sf-stock-below-min" className="cursor-pointer text-sm leading-none">
                {t("products.simpleFilter.stock.belowMin", { defaultValue: "poniżej minimalnego stanu" })}
              </label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="zero" id="sf-stock-zero" />
              <label htmlFor="sf-stock-zero" className="cursor-pointer text-sm leading-none">
                {t("products.simpleFilter.stock.zero", { defaultValue: "ze stanem równym 0" })}
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <RadioGroupItem value="gt" id="sf-stock-gt" />
              <label htmlFor="sf-stock-gt" className="cursor-pointer text-sm leading-none">
                {t("products.simpleFilter.stock.gt", { defaultValue: "ze stanem większym niż" })}
              </label>
              {draft.stockFilter === "gt" && (
                <Input
                  type="number"
                  min={0}
                  value={draft.stockValue}
                  onChange={e => setDraft(d => ({ ...d, stockValue: e.target.value }))}
                  className="h-7 w-20 text-sm"
                  placeholder="0"
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <RadioGroupItem value="lt" id="sf-stock-lt" />
              <label htmlFor="sf-stock-lt" className="cursor-pointer text-sm leading-none">
                {t("products.simpleFilter.stock.lt", { defaultValue: "ze stanem mniejszym niż" })}
              </label>
              {draft.stockFilter === "lt" && (
                <Input
                  type="number"
                  min={0}
                  value={draft.stockValue}
                  onChange={e => setDraft(d => ({ ...d, stockValue: e.target.value }))}
                  className="h-7 w-20 text-sm"
                  placeholder="0"
                />
              )}
            </div>
          </RadioGroup>
        </div>

        <div className="h-px bg-border" />

        {/* price */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">
            {t("products.simpleFilter.price.label", { defaultValue: "Pokaż produkty w cenie zakupu" })}
          </Label>
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-sm text-muted-foreground">od</span>
            <Input
              type="number"
              min={0}
              value={draft.priceFrom}
              onChange={e => setDraft(d => ({ ...d, priceFrom: e.target.value }))}
              className="h-9 flex-1"
              placeholder="min."
            />
            <span className="whitespace-nowrap text-sm text-muted-foreground">do</span>
            <Input
              type="number"
              min={0}
              value={draft.priceTo}
              onChange={e => setDraft(d => ({ ...d, priceTo: e.target.value }))}
              className="h-9 flex-1"
              placeholder="maks."
            />
            <span className="text-sm text-muted-foreground">PLN</span>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* isActive */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">
            {t("products.simpleFilter.active.label", { defaultValue: "Aktywność produktu" })}
          </Label>
          <RadioGroup
            value={draft.isActive ?? ""}
            onValueChange={(v) => setDraft(d => ({ ...d, isActive: v as SimpleFiltersState["isActive"] || null }))}
            className="space-y-2"
          >
            {([
              ["", t("products.simpleFilter.active.all", { defaultValue: "wszystkie" })],
              ["true", t("products.simpleFilter.active.active", { defaultValue: "aktywne" })],
              ["false", t("products.simpleFilter.active.inactive", { defaultValue: "nieaktywne" })],
            ] as [string, string][]).map(([value, label]) => (
              <div key={value || "all"} className="flex items-center gap-2">
                <RadioGroupItem value={value} id={`sf-active-${value || "all"}`} />
                <label htmlFor={`sf-active-${value || "all"}`} className="cursor-pointer text-sm leading-none">
                  {label}
                </label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="h-px bg-border" />

        {/* advanced filter link */}
        <div className="flex justify-center">
          <button
            type="button"
            className="text-sm text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
            onClick={() => {
              onOpenChange(false);
              onOpenAdvanced();
            }}
          >
            {t("products.simpleFilter.advanced", { defaultValue: "Filtry zaawansowane" })}
          </button>
        </div>

        {/* footer buttons */}
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={!hasAny}
          >
            {t("filters.clearAll", { defaultValue: "Wyczyść wszystko" })}
          </Button>
          <Button size="sm" onClick={handleApply}>
            {t("filters.apply", { defaultValue: "Zastosuj filtry" })}
          </Button>
        </div>
      </div>
    </SidePanel>
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
  const [simpleFiltersOpen, setSimpleFiltersOpen] = useState(false);
  const [simpleFilters, setSimpleFilters] = useState<SimpleFiltersState>(EMPTY_SIMPLE_FILTERS);
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

  const simpleFilterConditions = useMemo((): FilterCondition[] => {
    const conditions: FilterCondition[] = [];
    if (simpleFilters.productSection) conditions.push({ field: "productSection", operator: "equals", value: simpleFilters.productSection });
    if (simpleFilters.categoryId) conditions.push({ field: "categoryId", operator: "equals", value: simpleFilters.categoryId });
    if (simpleFilters.manufacturer) conditions.push({ field: "manufacturer", operator: "equals", value: simpleFilters.manufacturer });
    if (simpleFilters.isActive) conditions.push({ field: "isActive", operator: "equals", value: simpleFilters.isActive });
    if (simpleFilters.priceFrom) conditions.push({ field: "unitPrice", operator: "greaterThan", value: simpleFilters.priceFrom });
    if (simpleFilters.priceTo) conditions.push({ field: "unitPrice", operator: "lessThan", value: simpleFilters.priceTo });
    return conditions;
  }, [simpleFilters]);

  const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);
  const [categoriesSlideoutOpen, setCategoriesSlideoutOpen] = useState(false);

  // Sidebar action dispatches
  useSidebarDispatch("importCsv", () => setImportOpen(true));
  useSidebarDispatch("exportCsv", () => handleExport());
  useSidebarDispatch("savedViews", () => setSavedViewsDialogOpen(true));
  useSidebarDispatch("openFilter", () => setSimpleFiltersOpen(true));
  useSidebarDispatch("manageTags", () => setTagsSlideoutOpen(true));
  useSidebarDispatch("manageCategories", () => setCategoriesSlideoutOpen(true));
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null);
  const [stockHistoryProduct, setStockHistoryProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

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

  const manufacturers = useMemo(
    () => [...new Set(allProducts.map(p => p.manufacturer).filter((m): m is string => Boolean(m)))].sort(),
    [allProducts],
  );

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
    if (simpleFilters.stockFilter === "below_min") {
      data = data.filter(p => { const s = productStockStatus.get(p._id); return s === "low" || s === "out"; });
    } else if (simpleFilters.stockFilter === "zero") {
      data = data.filter(p => p.trackStock && (totalsByProductId.get(p._id)?.total ?? 0) <= 0);
    } else if (simpleFilters.stockFilter === "gt" && simpleFilters.stockValue) {
      data = data.filter(p => p.trackStock && (totalsByProductId.get(p._id)?.total ?? 0) > Number(simpleFilters.stockValue));
    } else if (simpleFilters.stockFilter === "lt" && simpleFilters.stockValue) {
      data = data.filter(p => p.trackStock && (totalsByProductId.get(p._id)?.total ?? 0) < Number(simpleFilters.stockValue));
    }
    data = applyFilterConditions(data, [...simpleFilterConditions, ...activeFilters]);
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
  }, [activeViewId, allProducts, applyFilters, activeFilters, simpleFilters, simpleFilterConditions, searchValue, nudgeFilter, usedProductIds, activeSection, productStockStatus, totalsByProductId]);

  const createProduct = useAction(api.products.create);
  const updateProduct = useAction(api.products.update);
  const removeProduct = useAction(api.products.remove);
  const toggleActive = useAction(api.products.toggleActive);

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

      {hasAnySimpleFilter(simpleFilters) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {t("products.simpleFilter.activeFilters", { defaultValue: "Aktywne filtry:" })}
          </span>

          {simpleFilters.productSection && (
            <FilterChip onRemove={() => setSimpleFilters(f => ({ ...f, productSection: null }))}>
              {t("products.simpleFilter.chips.section", { defaultValue: "Grupa:" })}
              {" "}
              {({ sale: t("products.sections.sale"), treatment: t("products.sections.treatment"), disposable: t("products.sections.disposable") })[simpleFilters.productSection] ?? simpleFilters.productSection}
            </FilterChip>
          )}

          {simpleFilters.categoryId && (
            <FilterChip onRemove={() => setSimpleFilters(f => ({ ...f, categoryId: null }))}>
              {t("products.simpleFilter.chips.category", { defaultValue: "Kategoria:" })}
              {" "}
              {categories.find(c => c._id === simpleFilters.categoryId)?.name ?? ""}
            </FilterChip>
          )}

          {simpleFilters.manufacturer && (
            <FilterChip onRemove={() => setSimpleFilters(f => ({ ...f, manufacturer: null }))}>
              {t("products.simpleFilter.chips.manufacturer", { defaultValue: "Dostawca:" })}
              {" "}
              {simpleFilters.manufacturer}
            </FilterChip>
          )}

          {simpleFilters.isActive && (
            <FilterChip onRemove={() => setSimpleFilters(f => ({ ...f, isActive: null }))}>
              {simpleFilters.isActive === "true"
                ? t("products.simpleFilter.active.active", { defaultValue: "Aktywne" })
                : t("products.simpleFilter.active.inactive", { defaultValue: "Nieaktywne" })}
            </FilterChip>
          )}

          {simpleFilters.stockFilter && (
            <FilterChip onRemove={() => setSimpleFilters(f => ({ ...f, stockFilter: null, stockValue: "" }))}>
              {simpleFilters.stockFilter === "below_min" && t("products.simpleFilter.stock.belowMin", { defaultValue: "Stan: poniżej minimum" })}
              {simpleFilters.stockFilter === "zero" && t("products.simpleFilter.stock.zero", { defaultValue: "Stan: równy 0" })}
              {simpleFilters.stockFilter === "gt" && `Stan > ${simpleFilters.stockValue}`}
              {simpleFilters.stockFilter === "lt" && `Stan < ${simpleFilters.stockValue}`}
            </FilterChip>
          )}

          {(simpleFilters.priceFrom || simpleFilters.priceTo) && (
            <FilterChip onRemove={() => setSimpleFilters(f => ({ ...f, priceFrom: "", priceTo: "" }))}>
              {simpleFilters.priceFrom && simpleFilters.priceTo
                ? `Cena: ${simpleFilters.priceFrom}–${simpleFilters.priceTo} PLN`
                : simpleFilters.priceFrom
                  ? `Cena: od ${simpleFilters.priceFrom} PLN`
                  : `Cena: do ${simpleFilters.priceTo} PLN`}
            </FilterChip>
          )}

          <button
            type="button"
            className="ml-auto shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => setSimpleFilters(EMPTY_SIMPLE_FILTERS)}
          >
            {t("filters.clearAll", { defaultValue: "Wyczyść wszystko" })}
          </button>
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

      <ProductSimpleFilterPanel
        open={simpleFiltersOpen}
        onOpenChange={setSimpleFiltersOpen}
        filters={simpleFilters}
        onApply={setSimpleFilters}
        categories={categories}
        manufacturers={manufacturers}
        onOpenAdvanced={() => setFilterSlideoutOpen(true)}
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
