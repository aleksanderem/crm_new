import { useState, useMemo } from "react";
import { useAction } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSupabase } from "@/components/supabase-provider";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSupabaseGabinetLocationsList } from "@/hooks/use-supabase-gabinet-locations";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatActionError } from "@/lib/format-action-error";
import { cn } from "@/lib/utils";
import type { MappedProduct } from "@/lib/supabase/mappers/products";
import type { ProductStockTotal } from "@/hooks/use-supabase-products";

const NO_LOCATION_VALUE = "__none__";

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

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function WarehouseInventoryDialog({
  open,
  onOpenChange,
  organizationId,
  products,
  totalsByProductId,
}: WarehouseInventoryDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const adjustStock = useAction(adjustStockRef);
  const { client, isReady } = useSupabase();
  const { data: locations = [] } = useSupabaseGabinetLocationsList(
    organizationId,
    { activeOnly: true },
  );

  const todayStr = toLocalDateStr(new Date());

  const [step, setStep] = useState<Step>("count");
  const [counts, setCounts] = useState<Map<string, string>>(new Map());
  const [locationId, setLocationId] = useState<string>(NO_LOCATION_VALUE);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resolvedLocationId: string | null =
    locationId === NO_LOCATION_VALUE ? null : locationId;

  const isHistoricalMode = selectedDate < todayStr;

  const historicalStockQuery = useQuery({
    queryKey: ["stockSnapshot", organizationId, selectedDate, resolvedLocationId ?? "null"],
    queryFn: async (): Promise<Map<string, number>> => {
      if (!client) throw new Error("Supabase client not ready");
      const endMs = new Date(selectedDate + "T23:59:59.999").getTime();
      let q = client
        .from("product_stock_movements")
        .select("product_id, balance_after")
        .eq("organization_id", organizationId)
        .lte("created_at", endMs)
        .order("created_at", { ascending: false });
      if (resolvedLocationId !== null) {
        q = q.eq("location_id", resolvedLocationId);
      } else {
        q = (q as typeof q).is("location_id", null);
      }
      const { data, error } = await q;
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of (data ?? []) as { product_id: string; balance_after: number | null }[]) {
        if (!map.has(row.product_id) && row.balance_after != null) {
          map.set(row.product_id, Number(row.balance_after));
        }
      }
      return map;
    },
    enabled: isHistoricalMode && isReady,
  });

  function getStockForLocation(stock: ProductStockTotal | undefined): number {
    if (!stock) return 0;
    const match = stock.byLocation.find(
      (row) => row.locationId === resolvedLocationId,
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
  }, [trackedProducts, counts, totalsByProductId, resolvedLocationId]);

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
      setLocationId(NO_LOCATION_VALUE);
      setSelectedDate(toLocalDateStr(new Date()));
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
          locationId: resolvedLocationId as Id<"gabinetLocations"> | null,
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
            {isHistoricalMode
              ? t("inventory.history.description", {
                  defaultValue:
                    "Widok tylko do odczytu. Stany odtworzone na podstawie historii ruchów magazynowych.",
                })
              : t("inventory.count.description", {
                  defaultValue:
                    "Wpisz rzeczywiste stany dla produktów, które chcesz zliczyć. Puste pola zostaną pominięte.",
                })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-1">
          <div className="space-y-1.5">
            <Label htmlFor="inventory-date">
              {t("inventory.count.dateLabel", { defaultValue: "Stan na dzień" })}
            </Label>
            <Input
              id="inventory-date"
              type="date"
              max={todayStr}
              value={selectedDate}
              onChange={(e) => {
                const val = e.target.value || todayStr;
                setSelectedDate(val);
                setStep("count");
                setCounts(new Map());
              }}
            />
          </div>

          {locations.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="inventory-location">
                {t("inventory.count.locationLabel", {
                  defaultValue: "Lokalizacja",
                })}
              </Label>
              <Select value={locationId} onValueChange={(v) => { setLocationId(v); setCounts(new Map()); }}>
                <SelectTrigger id="inventory-location">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LOCATION_VALUE}>
                    {t("inventory.count.locationNone", {
                      defaultValue: "Bez lokalizacji",
                    })}
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
        </div>

        {isHistoricalMode ? (
          historicalStockQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("common.loading", { defaultValue: "Ładowanie…" })}
            </p>
          ) : historicalStockQuery.isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              {t("inventory.history.error", {
                defaultValue: "Błąd ładowania danych historycznych.",
              })}
            </p>
          ) : trackedProducts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("inventory.count.noProducts", {
                defaultValue: "Brak aktywnych produktów ze śledzeniem stanu.",
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
                      {t("inventory.history.stockOnDate", { defaultValue: "Stan" })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trackedProducts.map((product) => {
                    const qty = historicalStockQuery.data?.get(product._id) ?? 0;
                    const unit = product.stockUnit?.trim() ?? "";
                    const u = unit ? ` ${unit}` : "";
                    return (
                      <tr key={product._id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{product.name}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {unit || "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {qty}{u}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : trackedProducts.length === 0 ? (
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
          {!isHistoricalMode && (
            <Button
              type="button"
              onClick={() => setStep("confirm")}
              disabled={counts.size === 0}
            >
              {t("inventory.count.next", { defaultValue: "Dalej" })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
