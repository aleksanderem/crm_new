import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  useSupabaseProductStockMovements,
  useSupabaseProductStockTotals,
  type MappedStockMovement,
  type StockMovementReason,
} from "@/hooks/use-supabase-products";
import type { MappedProduct } from "@/lib/supabase/mappers/products";
import { cn } from "@/lib/utils";

interface ProductStockHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  product: MappedProduct | null;
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function reasonLabel(reason: StockMovementReason, t: ReturnType<typeof useTranslation>["t"]): string {
  const map: Record<StockMovementReason, string> = {
    warehouse_receive: t("products.stock.reason.warehouse_receive", { defaultValue: "Przyjęcie magazynowe" }),
    initial: t("products.stock.reason.initial", { defaultValue: "Stan początkowy" }),
    manual_adjust: t("products.stock.reason.manual_adjust", { defaultValue: "Korekta ręczna" }),
    inventory_adjustment: t("products.stock.reason.inventory_adjustment", { defaultValue: "Inwentaryzacja" }),
    appointment_use: t("products.stock.reason.appointment_use", { defaultValue: "Zużycie podczas wizyty" }),
    appointment_return: t("products.stock.reason.appointment_return", { defaultValue: "Zwrot po wizycie" }),
    deal_close: t("products.stock.reason.deal_close", { defaultValue: "Zamknięcie transakcji" }),
    deal_reopen: t("products.stock.reason.deal_reopen", { defaultValue: "Wznowienie transakcji" }),
    transfer_in: t("products.stock.reason.transfer_in", { defaultValue: "Transfer — przyjęcie" }),
    transfer_out: t("products.stock.reason.transfer_out", { defaultValue: "Transfer — wydanie" }),
    other: t("products.stock.reason.other", { defaultValue: "Inne" }),
  };
  return map[reason] ?? reason;
}

function MovementRow({ movement, unit }: { movement: MappedStockMovement; unit: string }) {
  const { t } = useTranslation();
  const isPositive = movement.delta > 0;
  const deltaStr = isPositive
    ? `+${movement.delta}${unit ? ` ${unit}` : ""}`
    : `${movement.delta}${unit ? ` ${unit}` : ""}`;

  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 rounded-md border px-3 py-2.5 text-sm">
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "font-semibold tabular-nums",
              isPositive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-destructive",
            )}
          >
            {deltaStr}
          </span>
          <Badge variant="secondary" className="text-xs py-0 px-1.5">
            {reasonLabel(movement.reason, t)}
          </Badge>
        </div>
        {movement.note && (
          <p className="text-xs text-muted-foreground">{movement.note}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {movement.performedByName ?? movement.performedBy}
        </p>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDate(movement.createdAt)}
        </span>
        {movement.balanceAfter != null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("products.stock.history.balanceAfter", {
              defaultValue: "Stan: {{value}}",
              value: `${movement.balanceAfter}${unit ? ` ${unit}` : ""}`,
            })}
          </span>
        )}
      </div>
    </div>
  );
}

export function ProductStockHistoryDialog({
  open,
  onOpenChange,
  organizationId,
  product,
}: ProductStockHistoryDialogProps) {
  const { t } = useTranslation();
  const { totalsByProductId } = useSupabaseProductStockTotals(organizationId, {
    enabled: open && !!product,
  });
  const { data: movements = [], isLoading } = useSupabaseProductStockMovements(
    organizationId,
    product?._id ?? null,
    { enabled: open && !!product },
  );

  if (!product) return null;

  const stockSummary = totalsByProductId.get(product._id);
  const currentStock = stockSummary?.total ?? 0;
  const unit = product.stockUnit?.trim() ?? "";
  const unitStr = unit ? ` ${unit}` : "";

  const lastReceipt = movements.find(
    (m) => m.reason === "warehouse_receive" || (m.delta > 0 && m.reason === "initial"),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {t("products.stock.history.title", {
              defaultValue: "Historia operacji",
            })}
          </DialogTitle>
          <DialogDescription>{product.name}</DialogDescription>
        </DialogHeader>

        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 px-3 py-2.5 text-sm shrink-0">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              {t("products.stock.adjust.currentBalance", {
                defaultValue: "Aktualny stan",
              })}
            </span>
            <span className="font-semibold tabular-nums">
              {product.trackStock ? `${currentStock}${unitStr}` : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              {t("products.stock.history.lastReceive", {
                defaultValue: "Ostatnie przyjęcie",
              })}
            </span>
            <span className="font-semibold tabular-nums">
              {lastReceipt ? `+${lastReceipt.delta}${unitStr}` : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              {t("products.stock.history.lastReceiveDate", {
                defaultValue: "Data przyjęcia",
              })}
            </span>
            <span className="font-medium text-xs">
              {lastReceipt
                ? new Intl.DateTimeFormat("pl-PL", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  }).format(new Date(lastReceipt.createdAt))
                : "—"}
            </span>
          </div>
        </div>

        {/* Movement list */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {isLoading && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("common.loading", { defaultValue: "Ładowanie…" })}
            </p>
          )}
          {!isLoading && movements.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("products.stock.history.empty", {
                defaultValue: "Brak operacji magazynowych dla tego produktu.",
              })}
            </p>
          )}
          {movements.map((m) => (
            <MovementRow key={m._id} movement={m} unit={unit} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
