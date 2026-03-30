import { useState, useMemo, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseProductsList } from "@/hooks/use-supabase-products";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable, useColumnVisibility, useAllColumns, type CrmColumn } from "@/components/crm/enhanced-data-table";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import { SidePanel } from "@/components/crm/side-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Power, Upload, Download } from "@/lib/ez-icons";
import { useCsvExport } from "@/components/csv/csv-export-button";
import { CsvImportDialog } from "@/components/csv/csv-import-dialog";
import type { SavedView, FieldDef } from "@/components/crm/types";
import type { MappedProduct } from "@/lib/supabase/mappers";
import type { Id } from "@cvx/_generated/dataModel";
import { useSavedViews } from "@/hooks/use-saved-views";

type Product = MappedProduct;
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
import { TagsManagerSlideout } from "@/components/categories-tags/tags-manager-slideout";
import { CategoriesManagerSlideout } from "@/components/categories-tags/categories-manager-slideout";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/products/"
)({
  component: ProductsPage,
});

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

function ProductsPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const { tags } = useTagDefinitions(organizationId);
  const { categories } = useCategoryDefinitions(organizationId, "product");
  const systemViews: SavedView[] = useMemo(() => [
    { id: "all", name: t('products.views.all'), isSystem: true, isDefault: true },
    { id: "active", name: t('products.views.active'), isSystem: true, isDefault: false },
  ], [t]);

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
    { id: "tagIds", label: t('common.tags', { defaultValue: "Tagi" }), type: "multiSelect" as const, options: tags.map((tag: any) => ({ label: tag.name, value: tag._id })) },
    { id: "categoryId", label: t('common.category', { defaultValue: "Kategoria" }), type: "select" as const, options: categories.map(cat => ({ label: cat.name, value: cat._id })) },
  ], [t, tags, categories]);

  const {
    views, activeViewId, onViewChange, onCreateView, onDeleteView, applyFilters,
  } = useSavedViews({ organizationId, entityType: "product", systemViews });
  const toolbarRef = useRef<React.ReactNode>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [savedViewsDialogOpen, setSavedViewsDialogOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const { handleExport } = useCsvExport(organizationId, "products");
  const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);
  const [categoriesSlideoutOpen, setCategoriesSlideoutOpen] = useState(false);

  // Sidebar action dispatches
  useSidebarDispatch("importCsv", () => setImportOpen(true));
  useSidebarDispatch("exportCsv", () => handleExport());
  useSidebarDispatch("savedViews", () => setSavedViewsDialogOpen(true));
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [description, setDescription] = useState("");
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>([]);
  const [categoryId, setCategoryId] = useState<Id<"categoryDefinitions"> | undefined>(undefined);

  const { data: allProducts = [], isLoading } = useSupabaseProductsList(organizationId);

  const products = useMemo(() => {
    let data = allProducts;
    if (activeViewId === "active") {
      data = allProducts.filter((p) => p.isActive);
    }
    data = applyFilters(data);
    if (searchValue.trim()) {
      const q = searchValue.trim().toLowerCase();
      data = data.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
      );
    }
    return data;
  }, [activeViewId, allProducts, applyFilters, searchValue]);

  const createProduct = useMutation(api.products.create);
  const updateProduct = useMutation(api.products.update);
  const removeProduct = useMutation(api.products.remove);
  const toggleActive = useMutation(api.products.toggleActive);

  const resetForm = () => {
    setName("");
    setSku(generateSku());
    setUnitPrice("");
    setTaxRate("0");
    setIsActive(true);
    setDescription("");
    setTagIds([]);
    setCategoryId(undefined);
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
    setTaxRate(String(product.taxRate));
    setIsActive(product.isActive);
    setDescription(product.description ?? "");
    setTagIds((product as any).tagIds ?? []);
    setCategoryId((product as any).categoryId);
    setPanelOpen(true);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !sku.trim() || !unitPrice) return;
    setIsSubmitting(true);
    try {
      if (editingProduct) {
        await updateProduct({
          organizationId,
          productId: editingProduct._id as any,
          name: name.trim(),
          sku: sku.trim(),
          unitPrice: parseFloat(unitPrice),
          taxRate: parseFloat(taxRate) || 0,
          description: description.trim() || undefined,
          tagIds: tagIds.length > 0 ? tagIds : undefined,
          categoryId: categoryId || undefined,
        });
      } else {
        await createProduct({
          organizationId,
          name: name.trim(),
          sku: sku.trim(),
          unitPrice: parseFloat(unitPrice),
          taxRate: parseFloat(taxRate) || 0,
          isActive,
          description: description.trim() || undefined,
          tagIds: tagIds.length > 0 ? tagIds : undefined,
          categoryId: categoryId || undefined,
        });
      }
      setPanelOpen(false);
      resetForm();
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.products.list(organizationId) });
    } finally {
      setIsSubmitting(false);
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
      id: "sku",
      label: t('products.sku'),
      render: (item) => item.sku ?? "\u2014",
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
      render: (item) => item.taxRate != null ? `${item.taxRate}%` : "\u2014",
    },
    {
      id: "isActive",
      label: t('common.active'),
      render: (item) => item.isActive ? "\u2713" : "\u2014",
    },
  ];

  const { allColumns, defaultHidden } = useAllColumns(columns, filterableFields);
  const { hiddenColumnIds, toggleColumn } = useColumnVisibility(defaultHidden);

  const rowActions = (row: Product) => [
    {
      label: t('common.edit'),
      icon: <Pencil className="h-4 w-4" variant="stroke" />,
      onClick: () => openEditPanel(row),
    },
    {
      label: row.isActive ? t('products.deactivate') : t('products.activate'),
      icon: <Power className="h-4 w-4" variant="stroke" />,
      onClick: () => {
        void toggleActive({ organizationId, productId: row._id as any }).then(() => {
          void queryClient.invalidateQueries({ queryKey: supabaseKeys.products.list(organizationId) });
        });
      },
    },
    {
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" variant="stroke" />,
      onClick: () => {
        void removeProduct({ organizationId, productId: row._id as any }).then(() => {
          void queryClient.invalidateQueries({ queryKey: supabaseKeys.products.list(organizationId) });
        });
      },
    },
  ];

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

      <DataListFilterBar
        views={views as any}
        activeViewId={activeViewId}
        onViewChange={onViewChange}
        onCreateView={onCreateView}
        onDeleteView={onDeleteView}
        filterableFields={filterableFields}
        createDialogOpen={savedViewsDialogOpen}
        onCreateDialogOpenChange={setSavedViewsDialogOpen}
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
        renderToolbar={(toolbar) => { toolbarRef.current = toolbar; return null; }}
      />

      <CrmDataTable
        columns={allColumns}
        hiddenColumnIds={hiddenColumnIds}
        data={products}
        rowActions={rowActions}
        isLoading={isLoading}
        toolbar={toolbarRef.current}
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

          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                {t('products.unitPrice')} <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t('products.taxRate')}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                placeholder="0"
              />
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
              <TagsPicker
                tags={tags}
                selectedIds={tagIds}
                onChange={setTagIds}
              />
            </div>
          )}
          {categories.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t('common.category', { defaultValue: "Kategoria" })}</Label>
              <CategoryPicker
                categories={categories}
                selectedId={categoryId}
                onChange={setCategoryId}
              />
            </div>
          )}
        </div>
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
    </div>
  );
}
