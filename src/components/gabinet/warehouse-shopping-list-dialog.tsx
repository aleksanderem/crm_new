import { useState, useMemo, useEffect, useRef } from "react";
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
import { useSupabaseProductsLastDeliveryInfo } from "@/hooks/use-supabase-products";
import { CopyIcon } from "@/lib/ez-icons";
import { formatCurrencyPLN } from "@/lib/format-currency";
import type { MappedProduct } from "@/lib/supabase/mappers/products";
import type { ProductStockTotal } from "@/hooks/use-supabase-products";
import {
  getEffectiveQty,
  computeItemCost,
  groupShoppingItems,
  type GroupedItems as GroupedShoppingItems,
} from "./warehouse-shopping-list-helpers";

export { getEffectiveQty, computeItemCost, groupShoppingItems };
export type { GroupedShoppingItems };

const NO_LOCATION_VALUE = "__none__";
const NO_SUPPLIER_LABEL = "Brak przypisanego dostawcy";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WarehouseShoppingListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  products: MappedProduct[];
  totalsByProductId: Map<string, ProductStockTotal>;
  plannedUsageByProductId: Map<string, { plannedUsage: number }>;
}

interface ShoppingItem {
  product: MappedProduct;
  currentStock: number;
  minStock: number;
  defaultQty: number;
  plannedUsage: number | null;
  supplier: string | null;
  unitPriceGross: number | null;
}

function formatNowPL(): string {
  return new Date().toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function fmtQty(qty: number, unit: string | null | undefined): string {
  const u = unit?.trim();
  return u ? `${qty} ${u}` : String(qty);
}

function fmtPrice(unitPriceGross: number | null): string {
  if (unitPriceGross === null) return "Brak ceny";
  return formatCurrencyPLN(unitPriceGross, "zł");
}


// ---------------------------------------------------------------------------
// Print view
// ---------------------------------------------------------------------------

interface PrintBodyProps {
  groups: GroupedShoppingItems<ShoppingItem>[];
  quantities: Map<string, string>;
  locationLabel: string;
  generatedAt: string;
  grandTotal: number;
  hasItemsWithoutPrice: boolean;
}

function PrintBody({
  groups,
  quantities,
  locationLabel,
  generatedAt,
  grandTotal,
  hasItemsWithoutPrice,
}: PrintBodyProps) {
  let globalIdx = 0;
  return (
    <div className="space-y-4 p-6 text-sm text-foreground print:text-black">
      <div className="text-center">
        <h1 className="text-xl font-bold">Lista zakupowa</h1>
        <p className="mt-1 text-sm text-muted-foreground print:text-gray-600">
          {locationLabel} · {generatedAt}
        </p>
      </div>

      {groups.map((group) => {
        const supplierLabel = group.supplier ?? NO_SUPPLIER_LABEL;
        let groupTotal = 0;
        let groupHasMissingPrice = false;

        const rows = group.items.map((item) => {
          const qty = getEffectiveQty(item.defaultQty, item.product._id, quantities);
          const cost = computeItemCost(qty, item.unitPriceGross);
          if (cost === null) {
            groupHasMissingPrice = true;
          } else {
            groupTotal += cost;
          }
          globalIdx += 1;
          return { item, qty, cost, idx: globalIdx };
        });

        return (
          <div key={supplierLabel} className="space-y-1">
            <h2 className="font-semibold text-sm border-b pb-1">{supplierLabel}</h2>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-border bg-muted/40 print:bg-transparent print:border-black">
                  <th className="px-2 py-2 text-left font-semibold">Lp.</th>
                  <th className="px-2 py-2 text-left font-semibold">Produkt</th>
                  <th className="px-2 py-2 text-right font-semibold">Stan</th>
                  <th className="px-2 py-2 text-right font-semibold">Min.</th>
                  <th className="px-2 py-2 text-right font-semibold">Plan.</th>
                  <th className="px-2 py-2 text-right font-semibold">Do zam.</th>
                  <th className="px-2 py-2 text-right font-semibold">Cena brutto</th>
                  <th className="px-2 py-2 text-right font-semibold">Szac. wartość</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item, qty, cost, idx }) => (
                  <tr key={item.product._id} className="border-b border-border print:border-gray-300">
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{idx}</td>
                    <td className="px-2 py-1.5 font-medium">{item.product.name}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmtQty(item.currentStock, item.product.stockUnit)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmtQty(item.minStock, item.product.stockUnit)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {item.plannedUsage !== null
                        ? fmtQty(item.plannedUsage, item.product.stockUnit)
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                      {fmtQty(qty, item.product.stockUnit)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmtPrice(item.unitPriceGross)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                      {cost === null ? "—" : formatCurrencyPLN(cost, "zł")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right text-xs font-medium pt-1">
              {groupHasMissingPrice && groupTotal === 0
                ? "Razem u dostawcy: —"
                : `Razem u dostawcy: ${formatCurrencyPLN(groupTotal, "zł")}${groupHasMissingPrice ? "*" : ""}`}
            </div>
          </div>
        );
      })}

      <div className="border-t-2 border-border pt-2 text-sm font-bold text-right">
        Łączny szacowany koszt zamówień brutto: {formatCurrencyPLN(grandTotal, "zł")}
        {hasItemsWithoutPrice ? "*" : ""}
      </div>
      {hasItemsWithoutPrice && (
        <p className="text-xs text-muted-foreground print:text-gray-500">
          * Łączny koszt nie obejmuje pozycji bez ceny.
        </p>
      )}
      <div className="border-t border-border pt-2 text-xs print:border-black">
        Liczba pozycji: {groups.reduce((s, g) => s + g.items.length, 0)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function WarehouseShoppingListDialog({
  open,
  onOpenChange,
  organizationId,
  products,
  totalsByProductId,
  plannedUsageByProductId,
}: WarehouseShoppingListDialogProps) {
  const { t } = useTranslation();
  const { data: locations = [] } = useSupabaseGabinetLocationsList(organizationId, { activeOnly: true });
  const { lastDeliveryByProductId } = useSupabaseProductsLastDeliveryInfo(organizationId, {
    enabled: open,
  });
  const [locationId, setLocationId] = useState<string>(NO_LOCATION_VALUE);
  const [quantities, setQuantities] = useState<Map<string, string>>(new Map());
  const hasAutoSelectedRef = useRef(false);

  // Auto-select the single location when locations data loads asynchronously after dialog opens.
  useEffect(() => {
    if (open && !hasAutoSelectedRef.current && locations.length === 1) {
      hasAutoSelectedRef.current = true;
      setLocationId(locations[0]._id);
    }
  }, [open, locations]);

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
        const usageData = plannedUsageByProductId.get(p._id);
        const deliveryInfo = lastDeliveryByProductId.get(p._id);
        const unitPriceGross =
          deliveryInfo?.unitPriceGross != null
            ? deliveryInfo.unitPriceGross
            : p.purchasePrice != null && p.purchasePrice > 0
              ? p.purchasePrice
              : null;
        return {
          product: p,
          currentStock,
          minStock,
          defaultQty: Math.max(minStock - currentStock, 1),
          plannedUsage: usageData?.plannedUsage ?? null,
          supplier: deliveryInfo?.supplierName ?? null,
          unitPriceGross,
        };
      });
  }, [products, totalsByProductId, locationId, locations, resolvedLocationId, plannedUsageByProductId, lastDeliveryByProductId]);

  const supplierGroups = useMemo(
    () => groupShoppingItems(shoppingItems),
    [shoppingItems],
  );

  const { grandTotal, hasItemsWithoutPrice } = useMemo(() => {
    let total = 0;
    let hasWithout = false;
    for (const item of shoppingItems) {
      const qty = getEffectiveQty(item.defaultQty, item.product._id, quantities);
      const cost = computeItemCost(qty, item.unitPriceGross);
      if (cost === null) {
        hasWithout = true;
      } else {
        total += cost;
      }
    }
    return { grandTotal: total, hasItemsWithoutPrice: hasWithout };
  }, [shoppingItems, quantities]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      hasAutoSelectedRef.current = false;
      const initial = locations.length === 1 ? locations[0]._id : NO_LOCATION_VALUE;
      if (locations.length === 1) hasAutoSelectedRef.current = true;
      setLocationId(initial);
      setQuantities(new Map());
    }
    onOpenChange(nextOpen);
  };

  const handleLocationChange = (v: string) => {
    setLocationId(v);
    setQuantities(new Map());
  };

  const locationLabel = useMemo(() => {
    if (locations.length === 0)
      return t("inventory.count.locationNone", { defaultValue: "Bez lokalizacji" });
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
    let globalIdx = 0;
    for (const group of supplierGroups) {
      const supplierLabel = group.supplier ?? NO_SUPPLIER_LABEL;
      lines.push(`=== ${supplierLabel} ===`);
      let groupTotal = 0;
      let groupHasMissing = false;
      for (const item of group.items) {
        globalIdx += 1;
        const qty = getEffectiveQty(item.defaultQty, item.product._id, quantities);
        const unit = item.product.stockUnit?.trim();
        const unitStr = unit ? ` ${unit}` : "";
        const cost = computeItemCost(qty, item.unitPriceGross);
        if (cost === null) {
          groupHasMissing = true;
        } else {
          groupTotal += cost;
        }
        const costStr = cost === null ? "Brak ceny" : formatCurrencyPLN(cost, "zł");
        lines.push(
          `${globalIdx}. ${item.product.name} — ${qty}${unitStr}` +
            ` (stan: ${item.currentStock}${unitStr}, min: ${item.minStock}${unitStr}` +
            (item.plannedUsage !== null ? `, plan.: ${item.plannedUsage}${unitStr}` : "") +
            `) · ${fmtPrice(item.unitPriceGross)} · ${costStr}`,
        );
      }
      const groupTotalStr =
        groupHasMissing && groupTotal === 0
          ? "—"
          : formatCurrencyPLN(groupTotal, "zł") + (groupHasMissing ? "*" : "");
      lines.push(`Razem u dostawcy: ${groupTotalStr}`, "");
    }
    lines.push(
      `Łączny szacowany koszt zamówień brutto: ${formatCurrencyPLN(grandTotal, "zł")}${hasItemsWithoutPrice ? "*" : ""}`,
    );
    if (hasItemsWithoutPrice) {
      lines.push("* Łączny koszt nie obejmuje pozycji bez ceny.");
    }

    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        toast.success(
          t("shoppingList.copySuccess", { defaultValue: "Lista skopiowana do schowka." }),
        );
      })
      .catch(() => {
        toast.error(
          t("shoppingList.copyError", { defaultValue: "Nie udało się skopiować listy." }),
        );
      });
  };

  const handlePrint = () => {
    window.print();
  };

  const printBody = (
    <PrintBody
      groups={supplierGroups}
      quantities={quantities}
      locationLabel={locationLabel}
      generatedAt={generatedAt}
      grandTotal={grandTotal}
      hasItemsWithoutPrice={hasItemsWithoutPrice}
    />
  );

  return (
    <>
      {open && <div className="print-shopping-list">{printBody}</div>}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col">
          <DialogHeader>
            <DialogTitle>
              {t("shoppingList.title", { defaultValue: "Lista zakupowa" })}
            </DialogTitle>
            <DialogDescription>
              {t("shoppingList.description", {
                defaultValue:
                  "Produkty, których stan jest równy lub niższy od minimalnego. Możesz edytować sugerowane ilości przed wydrukiem.",
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
                {t("shoppingList.empty", {
                  defaultValue: "Brak produktów wymagających zamówienia.",
                })}
              </p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="overflow-x-auto">
                {supplierGroups.map((group) => {
                  const supplierLabel = group.supplier ?? NO_SUPPLIER_LABEL;
                  let groupTotal = 0;
                  let groupHasMissingPrice = false;

                  const itemRows = group.items.map((item) => {
                    const qty = getEffectiveQty(item.defaultQty, item.product._id, quantities);
                    const cost = computeItemCost(qty, item.unitPriceGross);
                    if (cost === null) {
                      groupHasMissingPrice = true;
                    } else {
                      groupTotal += cost;
                    }
                    return { item, qty, cost };
                  });

                  return (
                    <div key={supplierLabel} className="mb-4">
                      <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b bg-muted/30">
                        {supplierLabel}
                      </div>
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-background">
                          <tr className="border-b">
                            <th className="px-3 py-2 text-left font-medium min-w-[140px]">
                              {t("common.name")}
                            </th>
                            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
                              {t("shoppingList.col.currentStock", { defaultValue: "Stan" })}
                            </th>
                            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
                              {t("shoppingList.col.minStock", { defaultValue: "Min. stan" })}
                            </th>
                            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
                              {t("products.plannedUsage.column", {
                                defaultValue: "Plan. zużycie",
                              })}
                            </th>
                            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
                              {t("shoppingList.col.toOrder", { defaultValue: "Do zamówienia" })}
                            </th>
                            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
                              {t("shoppingList.col.unitPriceGross", {
                                defaultValue: "Cena brutto",
                              })}
                            </th>
                            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
                              {t("shoppingList.col.estimatedCost", {
                                defaultValue: "Szac. wartość",
                              })}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {itemRows.map(({ item, qty: _qty, cost }) => {
                            const unit = item.product.stockUnit?.trim() || "";
                            const override = quantities.get(item.product._id);
                            const displayVal = override ?? String(item.defaultQty);
                            return (
                              <tr key={item.product._id} className="border-b last:border-0">
                                <td className="px-3 py-2 font-medium">{item.product.name}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                  {fmtQty(item.currentStock, unit)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                  {fmtQty(item.minStock, unit)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                  {item.plannedUsage !== null
                                    ? fmtQty(item.plannedUsage, unit)
                                    : "—"}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center justify-end gap-1">
                                    <Input
                                      type="text"
                                      inputMode="numeric"
                                      className="h-8 w-20 text-right tabular-nums"
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
                                    {unit && (
                                      <span className="text-xs text-muted-foreground w-6">
                                        {unit}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                  {fmtPrice(item.unitPriceGross)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap">
                                  {cost === null ? "—" : formatCurrencyPLN(cost, "zł")}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div className="flex justify-end px-3 py-1.5 text-xs font-medium text-muted-foreground border-t bg-muted/20">
                        {t("shoppingList.supplierTotal", {
                          defaultValue: "Razem u dostawcy:",
                        })}{" "}
                        <span className="ml-1 font-semibold text-foreground">
                          {groupHasMissingPrice && groupTotal === 0
                            ? "—"
                            : formatCurrencyPLN(groupTotal, "zł") +
                              (groupHasMissingPrice ? "*" : "")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t px-3 py-3 space-y-1">
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span>
                    {t("shoppingList.grandTotal", {
                      defaultValue: "Łączny szacowany koszt zamówień brutto:",
                    })}
                  </span>
                  <span>
                    {formatCurrencyPLN(grandTotal, "zł")}
                    {hasItemsWithoutPrice ? "*" : ""}
                  </span>
                </div>
                {hasItemsWithoutPrice && (
                  <p className="text-xs text-muted-foreground">
                    {t("shoppingList.missingPriceNote", {
                      defaultValue: "* Łączny koszt nie obejmuje pozycji bez ceny.",
                    })}
                  </p>
                )}
              </div>
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
