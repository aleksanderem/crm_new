import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Package, Plus } from "@/lib/ez-icons";

interface LeadProductItem {
  _id: string;
  quantity: number;
  unitPrice: number;
  product?: {
    name?: string | null;
  } | null;
}

interface ProductDialogSearchResult {
  _id: string;
  name: string;
  unitPrice: number;
}

interface ProductDialogSelectedProduct {
  _id: string;
  name: string;
  unitPrice: number;
}

export interface LeadProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchResults: ProductDialogSearchResult[];
  isSearching: boolean;
  selectedProductId: string | null;
  selectedProduct: ProductDialogSelectedProduct | null;
  onSelectProduct: (productId: string) => void;
  quantity: string;
  onQuantityChange: (value: string) => void;
  unitPrice: string;
  onUnitPriceChange: (value: string) => void;
  discount: string;
  onDiscountChange: (value: string) => void;
  searchPlaceholder: string;
  searchLoadingLabel: string;
  noResultsLabel: string;
  minimumSearchLabel: string;
  quantityLabel: string;
  unitPriceLabel: string;
  discountLabel: string;
  cancelLabel: string;
  confirmLabel: string;
  canConfirm: boolean;
  onConfirm: () => void;
}

interface LeadProductsSidebarCardProps {
  title: string;
  emptyText: string;
  totalLabel: string;
  addLabel: string;
  products: LeadProductItem[];
  onAddProduct: () => void;
  onRemoveProduct: (dealProductId: string) => void;
  formatCurrency?: (value: number) => string;
  unknownLabel?: string;
  productDialog?: LeadProductsDialogProps;
}

function defaultFormatCurrency(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function LeadProductsDialogBody({
  searchValue,
  onSearchChange,
  searchResults,
  isSearching,
  selectedProductId,
  selectedProduct,
  onSelectProduct,
  quantity,
  onQuantityChange,
  unitPrice,
  onUnitPriceChange,
  discount,
  onDiscountChange,
  searchPlaceholder,
  searchLoadingLabel,
  noResultsLabel,
  minimumSearchLabel,
  quantityLabel,
  unitPriceLabel,
  discountLabel,
  formatCurrency,
}: Omit<LeadProductsDialogProps, "open" | "onOpenChange" | "cancelLabel" | "confirmLabel" | "canConfirm" | "onConfirm"> & {
  formatCurrency: (value: number) => string;
}) {
  const searchQuery = searchValue.trim();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
        />
        {searchQuery.length >= 3 ? (
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
            {isSearching ? (
              <p className="px-2 py-1 text-sm text-muted-foreground">{searchLoadingLabel}</p>
            ) : searchResults.length > 0 ? (
              searchResults.map((product) => (
                <button
                  key={product._id}
                  type="button"
                  onClick={() => onSelectProduct(product._id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted",
                    selectedProductId === product._id && "bg-muted"
                  )}
                >
                  <span>{product.name}</span>
                  <span className="text-xs text-muted-foreground">{formatCurrency(product.unitPrice)}</span>
                </button>
              ))
            ) : (
              <p className="px-2 py-1 text-sm text-muted-foreground">{noResultsLabel}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{minimumSearchLabel}</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="lead-product-quantity">{quantityLabel}</label>
          <Input
            id="lead-product-quantity"
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(event) => onQuantityChange(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="lead-product-unit-price">{unitPriceLabel}</label>
          <Input
            id="lead-product-unit-price"
            type="text"
            inputMode="decimal"
            value={unitPrice}
            onChange={(event) => {
              const v = event.target.value;
              if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                onUnitPriceChange(v);
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="lead-product-discount">{discountLabel}</label>
          <Input
            id="lead-product-discount"
            type="text"
            inputMode="decimal"
            value={discount}
            onChange={(event) => {
              const v = event.target.value;
              if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                onDiscountChange(v);
              }
            }}
          />
        </div>
      </div>

      {selectedProduct && (
        <p className="text-sm text-muted-foreground">
          {selectedProduct.name} · {formatCurrency(selectedProduct.unitPrice)}
        </p>
      )}
    </div>
  );
}

export function LeadProductsSidebarCard({
  title,
  emptyText,
  totalLabel,
  addLabel,
  products,
  onAddProduct,
  onRemoveProduct,
  formatCurrency = defaultFormatCurrency,
  unknownLabel = "—",
  productDialog,
}: LeadProductsSidebarCardProps) {
  const totalProductValue = products.reduce(
    (sum, product) => sum + product.quantity * product.unitPrice,
    0,
  );

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {title}{" "}
          {products.length > 0 && (
            <span className="text-muted-foreground font-normal">({products.length})</span>
          )}
        </h3>
        <Button size="sm" variant="outline" onClick={onAddProduct}>
          <Plus className="mr-1 h-4 w-4" variant="stroke" />
          {addLabel}
        </Button>
      </div>

        {products.length > 0 ? (
          <div className="space-y-2">
            {products.map((product) => (
              <div key={product._id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0 flex items-center gap-2">
                  <Package className="h-4 w-4 shrink-0 text-muted-foreground" variant="stroke" />
                  <span className="truncate">{product.product?.name ?? unknownLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground whitespace-nowrap">
                    {product.quantity} x {formatCurrency(product.unitPrice)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRemoveProduct(product._id)}
                    aria-label={`Remove ${product.product?.name ?? unknownLabel}`}
                  >
                    ×
                  </Button>
                </div>
              </div>
            ))}
            <div className="pt-2 border-t flex justify-between text-sm font-medium">
              <span>{totalLabel}</span>
              <span>{formatCurrency(totalProductValue)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        )}
      </div>

      {productDialog && (
        <Dialog open={productDialog.open} onOpenChange={productDialog.onOpenChange}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>

            <LeadProductsDialogBody
              searchValue={productDialog.searchValue}
              onSearchChange={productDialog.onSearchChange}
              searchResults={productDialog.searchResults}
              isSearching={productDialog.isSearching}
              selectedProductId={productDialog.selectedProductId}
              selectedProduct={productDialog.selectedProduct}
              onSelectProduct={productDialog.onSelectProduct}
              quantity={productDialog.quantity}
              onQuantityChange={productDialog.onQuantityChange}
              unitPrice={productDialog.unitPrice}
              onUnitPriceChange={productDialog.onUnitPriceChange}
              discount={productDialog.discount}
              onDiscountChange={productDialog.onDiscountChange}
              searchPlaceholder={productDialog.searchPlaceholder}
              searchLoadingLabel={productDialog.searchLoadingLabel}
              noResultsLabel={productDialog.noResultsLabel}
              minimumSearchLabel={productDialog.minimumSearchLabel}
              quantityLabel={productDialog.quantityLabel}
              unitPriceLabel={productDialog.unitPriceLabel}
              discountLabel={productDialog.discountLabel}
              formatCurrency={formatCurrency}
            />

            <DialogFooter>
              <Button variant="outline" onClick={() => productDialog.onOpenChange(false)}>
                {productDialog.cancelLabel}
              </Button>
              <Button onClick={productDialog.onConfirm} disabled={!productDialog.canConfirm}>
                {productDialog.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
