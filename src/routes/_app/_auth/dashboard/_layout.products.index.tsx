import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable } from "@/components/crm/enhanced-data-table";
import { SavedViewsTabs } from "@/components/crm/saved-views-tabs";
import { SidePanel } from "@/components/crm/side-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Plus, Pencil, Trash2, Power, Upload, Download } from "@/lib/ez-icons";
import { useCsvExport } from "@/components/csv/csv-export-button";
import { CsvImportDialog } from "@/components/csv/csv-import-dialog";
import type { ColumnDef } from "@tanstack/react-table";
import type { SavedView, FieldDef } from "@/components/crm/types";
import { Doc } from "@cvx/_generated/dataModel";
import { useSavedViews } from "@/hooks/use-saved-views";
import { QuickActionBar } from "@/components/crm/quick-action-bar";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/products/"
)({
  component: ProductsPage,
});

type Product = Doc<"products">;

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
  const systemViews: SavedView[] = useMemo(() => [
    { id: "all", name: t('products.views.all'), isSystem: true, isDefault: true },
    { id: "active", name: t('products.views.active'), isSystem: true, isDefault: false },
  ], [t]);

  const filterableFields = useMemo((): FieldDef[] => [
    {
      id: "isActive", label: t('common.active'), type: "select",
      options: [
        { label: t('common.yes'), value: "true" },
        { label: t('common.no'), value: "false" },
      ],
    },
    { id: "unitPrice", label: t('products.unitPrice'), type: "number" },
  ], [t]);

  const {
    views, activeViewId, onViewChange, onCreateView, onUpdateView, onDeleteView, applyFilters,
  } = useSavedViews({ organizationId, entityType: "product", systemViews });
  const [panelOpen, setPanelOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { handleExport } = useCsvExport(organizationId, "products");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [description, setDescription] = useState("");

  const { data, isLoading } = useQuery(
    convexQuery(api.products.list, {
      organizationId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  );

  const allProducts = data?.page ?? [];

  const products = useMemo(() => {
    let data = allProducts;
    if (activeViewId === "active") {
      data = allProducts.filter((p) => p.isActive);
    }
    return applyFilters(data);
  }, [activeViewId, allProducts, applyFilters]);

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
          productId: editingProduct._id,
          name: name.trim(),
          sku: sku.trim(),
          unitPrice: parseFloat(unitPrice),
          taxRate: parseFloat(taxRate) || 0,
          description: description.trim() || undefined,
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
        });
      }
      setPanelOpen(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: ColumnDef<Product, unknown>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('common.name')} />
      ),
      cell: ({ getValue }) => (
        <span className="font-medium">{getValue() as string}</span>
      ),
    },
    {
      accessorKey: "sku",
      header: t('products.sku'),
      cell: ({ getValue }) => (
        <span className="text-muted-foreground font-mono text-xs">
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "unitPrice",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('products.unitPrice')} />
      ),
      cell: ({ getValue }) => formatCurrency(getValue() as number),
    },
    {
      accessorKey: "taxRate",
      header: t('products.taxRate'),
      cell: ({ getValue }) => `${getValue() as number}%`,
    },
    {
      accessorKey: "isActive",
      header: t('common.active'),
      cell: ({ getValue }) => {
        const active = getValue() as boolean;
        return (
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              active ? "bg-green-500" : "bg-gray-300"
            }`}
            title={active ? "Active" : "Inactive"}
          />
        );
      },
    },
  ];

  const rowActions = (row: Product) => [
    {
      label: t('common.edit'),
      icon: <Pencil className="h-3.5 w-3.5" />,
      onClick: () => openEditPanel(row),
    },
    {
      label: row.isActive ? t('products.deactivate') : t('products.activate'),
      icon: <Power className="h-3.5 w-3.5" />,
      onClick: () => toggleActive({ organizationId, productId: row._id }),
    },
    {
      label: t('common.delete'),
      icon: <Trash2 className="h-3.5 w-3.5" />,
      onClick: () => removeProduct({ organizationId, productId: row._id }),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('products.title')}
        description={t('products.description')}
        actions={
          <Button onClick={openCreatePanel}>
            <Plus className="mr-2 h-4 w-4" />
            {t('products.addProduct')}
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
            label: t('quickActions.newProduct'),
            icon: <Plus className="mr-1.5 h-3.5 w-3.5" />,
            onClick: openCreatePanel,
            feature: "products",
            action: "create",
          },
        ]}
      />

      <CrmDataTable
        columns={columns}
        data={products}
        stickyFirstColumn
        rowActions={rowActions}
        searchKey="name"
        searchPlaceholder={t('products.searchPlaceholder')}
        isLoading={isLoading}
        toolbarDropdownActions={[
          { label: t("csv.export"), icon: <Download className="h-4 w-4" />, onClick: handleExport },
          { label: t("csv.import"), icon: <Upload className="h-4 w-4" />, onClick: () => setImportOpen(true) },
        ]}
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
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('products.productDescription')}
              rows={3}
            />
          </div>
        </div>
      </SidePanel>
    </div>
  );
}
