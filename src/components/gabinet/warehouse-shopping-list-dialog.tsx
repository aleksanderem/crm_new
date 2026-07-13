import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSupabaseGabinetLocationsList } from "@/hooks/use-supabase-gabinet-locations";
import { CopyIcon } from "@/lib/ez-icons";
import type { MappedProduct } from "@/lib/supabase/mappers/products";
import type { ProductStockTotal } from "@/hooks/use-supabase-products";

const NO_LOCATION_VALUE = "__none__";

interface WarehouseShoppingListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  products: MappedProduct[];
  totalsByProductId: Map<string, ProductStockTotal>;
}

interface ShoppingItem {
  product: MappedProduct;
  currentStock: number;
  minStock: number;
  defaultQty: number;
}

function formatNowPL(): string {
  return new Date().toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

interface PrintBodyProps {
  items: ShoppingItem[];
  quantities: Map<string, string>;
  locationLabel: string;
  generatedAt: string;
}

function PrintBody({ items, quantities, locationLabel, generatedAt }: PrintBodyProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 p-6 text-sm text-foreground print:text-black">
      <div className="text-center">
        <h1 className="text-xl font-bold">
          {t("shoppingList.print.title", { defaultValue: "Lista zakupowa" })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground print:text-gray-600">
          {locationLabel} · {generatedAt}
        </p>
      </div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-border bg-muted/40 print:bg-transparent print:border-black">
            <th className="px-2 py-2 text-left font-semibold">
              {t("inventory.accountantReport.colNo", { defaultValue: "Lp." })}
            </th>
            <th className="px-2 py-2 text-left font-semibold">
              {t("common.name")}
            </th>
            <th className="px-2 py-2 text-right font-semibold">
              {t("inventory.count.unit", { defaultValue: "Jedn." })}
            </th>
            <th className="px-2 py-2 text-right font-semibold">
              {t("shoppingList.col.currentStock", { defaultValue: "Stan" })}
            </th>
            <th className="px-2 py-2 text-right font-semibold">
              {t("shoppingList.col.minStock", { defaultValue: "Min. stan" })}
            </th>
            <th className="px-2 py-2 text-right font-semibold">
              {t("shoppingList.col.toOrder", { defaultValue: "Do zamówienia" })}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const unit = item.product.stockUnit?.trim() || "—";
            const override = quantities.get(item.product._id);
            const qty = override !== undefined
              ? (parseInt(override, 10) || item.defaultQty)
              : item.defaultQty;
            return (
              <tr key={item.product._id} className="border-b border-border print:border-gray-300">
                <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{idx + 1}</td>
                <td className="px-2 py-1.5 font-medium">{item.product.name}</td>
                <td className="px-2 py-1.5 text-right">{unit}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{item.currentStock}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{item.minStock}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{qty}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-border pt-2 text-xs print:border-black">
        {t("inventory.accountantReport.itemCount", { defaultValue: "Liczba pozycji" })}: {items.length}
      </div>
    </div>
  );
}

export function WarehouseShoppingListDialog({
  open,
  onOpenChange,
  organizationId,
  products,
  totalsByProductId,
}: WarehouseShoppingListDialogProps) {
  const { t } = useTranslation();
  const { data: locations = [] } = useSupabaseGabinetLocationsList(organizationId, { activeOnly: true });
  const [locationId, setLocationId] = useState<string>(NO_LOCATION_VALUE);
  const [quantities, setQuantities] = useState<Map<string, string>>(new Map());

  const resolvedLocationId: string | null = locationId === NO_LOCATION_VALUE ? null : locationId;

  function getStock(productId: string): number {
    const stock = totalsByProductId.get(productId);
    if (!stock) return 0;
    if (locations.length === 0) return stock.total;
    const match = stock.byLocation.find((row) => row.locationId === resolvedLocationId);
    return match?.quantity ?? 0;
  }

  const shoppingItems = useMemo((): ShoppingItem[] => {
    return products
      .filter((p) => p.trackStock && p.minStock != null && p.minStock > 0)
      .filter((p) => getStock(p._id) <= (p.minStock ?? 0))
      .map((p) => {
        const currentStock = getStock(p._id);
        const minStock = p.minStock!;
        return {
          product: p,
          currentStock,
          minStock,
          defaultQty: Math.max(minStock - currentStock, 1),
        };
      });
  }, [products, totalsByProductId, locationId, locations, resolvedLocationId]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setLocationId(NO_LOCATION_VALUE);
      setQuantities(new Map());
    }
    onOpenChange(nextOpen);
  };

  const handleLocationChange = (v: string) => {
    setLocationId(v);
    setQuantities(new Map());
  };

  const locationLabel = useMemo(() => {
    if (locations.length === 0) return t("inventory.count.locationNone", { defaultValue: "Bez lokalizacji" });
    const loc = locations.find((l) => l._id === resolvedLocationId);
    return loc?.name ?? t("inventory.count.locationNone", { defaultValue: "Bez lokalizacji" });
  }, [locations, resolvedLocationId, t]);

  const generatedAt = formatNowPL();

  const handleCopy = () => {
    const lines: string[] = [
      t("shoppingList.print.title", { defaultValue: "Lista zakupowa" }),
      `${locationLabel} · ${generatedAt}`,
      "",
    ];
    shoppingItems.forEach((item, idx) => {
      const unit = item.product.stockUnit?.trim();
      const unitStr = unit ? ` ${unit}` : "";
      const override = quantities.get(item.product._id);
      const qty = override !== undefined ? (parseInt(override, 10) || item.defaultQty) : item.defaultQty;
      lines.push(
        `${idx + 1}. ${item.product.name} — ${qty}${unitStr} (${t("shoppingList.col.currentStock", { defaultValue: "stan" })}: ${item.currentStock}${unitStr}, min: ${item.minStock}${unitStr})`,
      );
    });
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      toast.success(t("shoppingList.copySuccess", { defaultValue: "Lista skopiowana do schowka." }));
    }).catch(() => {
      toast.error(t("shoppingList.copyError", { defaultValue: "Nie udało się skopiować listy." }));
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const printBody = (
    <PrintBody
      items={shoppingItems}
      quantities={quantities}
      locationLabel={locationLabel}
      generatedAt={generatedAt}
    />
  );

  return (
    <>
      {open && (
        <div className="print-shopping-list">
          {printBody}
        </div>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col">
          <DialogHeader>
            <DialogTitle>
              {t("shoppingList.title", { defaultValue: "Lista zakupowa" })}
            </DialogTitle>
            <DialogDescription>
              {t("shoppingList.description", {
                defaultValue: "Produkty, których stan jest równy lub niższy od minimalnego. Możesz edytować sugerowane ilości przed wydrukiem.",
              })}
            </DialogDescription>
          </DialogHeader>

          {locations.length > 0 && (
            <div className="space-y-1.5 px-1">
              <Label htmlFor="shopping-list-location">
                {t("inventory.count.locationLabel", { defaultValue: "Lokalizacja" })}
              </Label>
              <Select value={locationId} onValueChange={handleLocationChange}>
                <SelectTrigger id="shopping-list-location">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LOCATION_VALUE}>
                    {t("inventory.count.locationNone", { defaultValue: "Bez lokalizacji" })}
                  </SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc._id} value={loc._id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {shoppingItems.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">
                {t("shoppingList.empty", { defaultValue: "Brak produktów wymagających zamówienia." })}
              </p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left font-medium">
                      {t("common.name")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("inventory.count.unit", { defaultValue: "Jedn." })}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("shoppingList.col.currentStock", { defaultValue: "Stan" })}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("shoppingList.col.minStock", { defaultValue: "Min. stan" })}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("shoppingList.col.toOrder", { defaultValue: "Do zamówienia" })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shoppingItems.map((item) => {
                    const unit = item.product.stockUnit?.trim() || "";
                    const override = quantities.get(item.product._id);
                    const displayVal = override ?? String(item.defaultQty);
                    return (
                      <tr key={item.product._id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{item.product.name}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {unit || "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {item.currentStock}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {item.minStock}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="text"
                            inputMode="numeric"
                            className="ml-auto h-8 w-20 text-right tabular-nums"
                            value={displayVal}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "" || /^[0-9]*$/.test(v)) {
                                setQuantities((prev) => {
                                  const next = new Map(prev);
                                  next.set(item.product._id, v);
                                  return next;
                                });
                              }
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {t("common.close", { defaultValue: "Zamknij" })}
            </Button>
            {shoppingItems.length > 0 && (
              <>
                <Button variant="outline" onClick={handleCopy}>
                  <CopyIcon className="mr-2 h-4 w-4" variant="stroke" />
                  {t("shoppingList.copyButton", { defaultValue: "Kopiuj listę" })}
                </Button>
                <Button onClick={handlePrint}>
                  {t("shoppingList.printButton", { defaultValue: "Drukuj" })}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
