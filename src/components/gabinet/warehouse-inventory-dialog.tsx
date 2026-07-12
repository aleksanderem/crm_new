import { useState, useMemo } from "react";
import { useAction } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Id } from "@cvx/_generated/dataModel";
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
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatActionError } from "@/lib/format-action-error";
import { cn } from "@/lib/utils";
import type { MappedProduct } from "@/lib/supabase/mappers/products";
import type { ProductStockTotal } from "@/hooks/use-supabase-products";

type AdjustStockArgs = {
  organizationId: Id<"organizations">;
  productId: string;
  locationId?: Id<"gabinetLocations"> | null;
  delta?: number;
  reason?: "initial" | "warehouse_receive" | "manual_adjust" | "inventory_adjustment" | "appointment_use" | "appointment_return" | "deal_close" | "deal_reopen" | "transfer_in" | "transfer_out" | "other";
  note?: string | null;
};
type AdjustStockResult = { movementId: string; balanceAfter: number; warning: string | null };
const adjustStockRef = makeFunctionReference<"action", AdjustStockArgs, AdjustStockResult>(
  "inventory:adjustStock",
);

interface WarehouseInventoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  locationId: string | null;
  products: MappedProduct[];
  totalsByProductId: Map<string, ProductStockTotal>;
}

type Step = "count" | "confirm";

type DiffKind = "surplus" | "shortage" | "match";

interface DiffRow {
  product: MappedProduct;
  systemStock: number;
  actual: number;
  delta: number;
  kind: DiffKind;
}

function parseActual(input: string): number | null {
  if (!input.trim()) return null;
  const v = parseFloat(input.replace(",", "."));
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}

export function WarehouseInventoryDialog({
  open,
  onOpenChange,
  organizationId,
  locationId,
  products,
  totalsByProductId,
}: WarehouseInventoryDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const adjustStock = useAction(adjustStockRef);

  const [step, setStep] = useState<Step>("count");
  const [counts, setCounts] = useState<Map<string, string>>(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);

  function getStockForLocation(stock: ProductStockTotal | undefined): number {
    if (!stock) return 0;
    const match = stock.byLocation.find(
      (row) => row.locationId === locationId,
    );
    return match?.quantity ?? 0;
  }

  const trackedProducts = useMemo(
    () => products.filter((p) => p.isActive && p.trackStock),
    [products],
  );

  const diffs: DiffRow[] = useMemo(() => {
    const result: DiffRow[] = [];
    for (const p of trackedProducts) {
      const input = counts.get(p._id) ?? "";
      const actual = parseActual(input);
      if (actual === null) continue;
      const systemStock = getStockForLocation(totalsByProductId.get(p._id));
      const delta = actual - systemStock;
      result.push({
        product: p,
        systemStock,
        actual,
        delta,
        kind: delta > 0 ? "surplus" : delta < 0 ? "shortage" : "match",
      });
    }
    return result;
  }, [trackedProducts, counts, totalsByProductId, locationId]);

  const summary = useMemo(() => {
    const withDiff = diffs.filter((d) => d.kind !== "match").length;
    const shortages = diffs
      .filter((d) => d.kind === "shortage")
      .reduce((sum, d) => sum + Math.abs(d.delta), 0);
    const surpluses = diffs
      .filter((d) => d.kind === "surplus")
      .reduce((sum, d) => sum + d.delta, 0);
    return { withDiff, shortages, surpluses };
  }, [diffs]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setStep("count");
      setCounts(new Map());
    }
    onOpenChange(nextOpen);
  };

  const handleConfirm = async () => {
    const toApply = diffs.filter((d) => d.kind !== "match");
    if (toApply.length === 0) {
      onOpenChange(false);
      return;
    }
    setIsSubmitting(true);
    const date = new Date().toLocaleDateString("pl-PL");
    const note = `Inwentaryzacja ${date}`;
    let negativeCount = 0;
    try {
      for (const row of toApply) {
        const result = await adjustStock({
          organizationId: organizationId as Id<"organizations">,
          productId: row.product._id,
          locationId: locationId as Id<"gabinetLocations"> | null,
          delta: row.delta,
          reason: "inventory_adjustment",
          note,
        });
        if (result.warning === "negative_stock") negativeCount++;
      }
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.productStockLevels.list(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.productStockMovements.list(organizationId),
      });
      if (negativeCount > 0) {
        toast.warning(
          t("inventory.confirm.negativeWarning", {
            defaultValue:
              "Inwentaryzacja zatwierdzona. Niektóre stany są ujemne — sprawdź historię.",
          }),
        );
      } else {
        toast.success(
          t("inventory.confirm.success", {
            count: toApply.length,
            defaultValue: `Inwentaryzacja zakończona. Skorygowano ${toApply.length} pozycji.`,
          }),
        );
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "inventory.confirm.error",
          defaultValue: "Nie udało się zatwierdzić inwentaryzacji.",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === "confirm") {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("inventory.confirm.title", {
                defaultValue: "Podsumowanie inwentaryzacji",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("inventory.confirm.description", {
                defaultValue:
                  "Sprawdź różnice przed zatwierdzeniem. Zostaną utworzone ruchy korygujące.",
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border px-3 py-2">
                <div className="text-lg font-semibold tabular-nums">
                  {summary.withDiff}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("inventory.confirm.withDiff", {
                    defaultValue: "Pozycji z różnicami",
                  })}
                </div>
              </div>
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                <div className="text-lg font-semibold tabular-nums text-destructive">
                  {summary.shortages}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("inventory.confirm.shortages", {
                    defaultValue: "Łączne niedobory",
                  })}
                </div>
              </div>
              <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/30">
                <div className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {summary.surpluses}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("inventory.confirm.surpluses", {
                    defaultValue: "Łączne nadwyżki",
                  })}
                </div>
              </div>
            </div>

            {diffs.length > 0 ? (
              <div className="max-h-64 overflow-y-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">
                        {t("common.name")}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t("inventory.count.systemStock", {
                          defaultValue: "System",
                        })}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t("inventory.count.actual", {
                          defaultValue: "Rzeczywisty",
                        })}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t("inventory.count.diff", { defaultValue: "Różnica" })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffs.map(({ product, systemStock, actual, delta, kind }) => {
                      const unit = product.stockUnit?.trim() ?? "";
                      const u = unit ? ` ${unit}` : "";
                      return (
                        <tr key={product._id} className="border-b last:border-0">
                          <td className="px-3 py-2">{product.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {systemStock}
                            {u}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {actual}
                            {u}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right tabular-nums font-medium",
                              kind === "shortage"
                                ? "text-destructive"
                                : kind === "surplus"
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-muted-foreground",
                            )}
                          >
                            {delta > 0 ? "+" : ""}
                            {delta}
                            {u}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("inventory.confirm.noChanges", {
                  defaultValue:
                    "Brak różnic — wszystkie stany się zgadzają.",
                })}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("count")}
              disabled={isSubmitting}
            >
              {t("common.back", { defaultValue: "Wróć" })}
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? t("common.saving", { defaultValue: "Zapisywanie…" })
                : t("inventory.confirm.submit", {
                    defaultValue: "Zatwierdź inwentaryzację",
                  })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // step === "count"
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>
            {t("inventory.count.title", {
              defaultValue: "Inwentaryzacja magazynu",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("inventory.count.description", {
              defaultValue:
                "Wpisz rzeczywiste stany dla produktów, które chcesz zliczyć. Puste pola zostaną pominięte.",
            })}
          </DialogDescription>
        </DialogHeader>

        {trackedProducts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("inventory.count.noProducts", {
              defaultValue:
                "Brak aktywnych produktów ze śledzeniem stanu.",
            })}
          </p>
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
                    {t("inventory.count.systemStock", {
                      defaultValue: "Stan sys.",
                    })}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t("inventory.count.actual", {
                      defaultValue: "Rzeczywisty",
                    })}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t("inventory.count.diff", { defaultValue: "Różnica" })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {trackedProducts.map((product) => {
                  const systemStock = getStockForLocation(
                    totalsByProductId.get(product._id),
                  );
                  const input = counts.get(product._id) ?? "";
                  const actual = parseActual(input);
                  const delta = actual !== null ? actual - systemStock : null;
                  const unit = product.stockUnit?.trim() ?? "";
                  const u = unit ? ` ${unit}` : "";
                  return (
                    <tr key={product._id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{product.name}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {unit || "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {systemStock}
                        {u}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="ml-auto h-8 w-24 text-right tabular-nums"
                          placeholder="—"
                          value={input}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                              setCounts((prev) => {
                                const next = new Map(prev);
                                if (v === "") next.delete(product._id);
                                else next.set(product._id, v);
                                return next;
                              });
                            }
                          }}
                        />
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums font-medium",
                          delta === null
                            ? "text-muted-foreground"
                            : delta < 0
                              ? "text-destructive"
                              : delta > 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground",
                        )}
                      >
                        {delta === null
                          ? "—"
                          : delta === 0
                            ? "="
                            : `${delta > 0 ? "+" : ""}${delta}${u}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => setStep("confirm")}
            disabled={counts.size === 0}
          >
            {t("inventory.count.next", { defaultValue: "Dalej" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
