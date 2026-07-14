import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSupabaseProductStockTotals } from "@/hooks/use-supabase-products";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatActionError } from "@/lib/format-action-error";
import type { MappedProduct } from "@/lib/supabase/mappers/products";

interface ProductStockCorrectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  product: MappedProduct | null;
}

type CorrectionReason =
  | "recount"
  | "damage"
  | "loss"
  | "consumption"
  | "other";

type AdjustStockArgs = {
  organizationId: Id<"organizations">;
  productId: string;
  locationId?: Id<"gabinetLocations"> | null;
  delta?: number;
  setTo?: number;
  reason?:
    | "initial"
    | "warehouse_receive"
    | "manual_adjust"
    | "inventory_adjustment"
    | "appointment_use"
    | "appointment_return"
    | "deal_close"
    | "deal_reopen"
    | "transfer_in"
    | "transfer_out"
    | "other";
  note?: string | null;
};
type AdjustStockResult = {
  movementId: string;
  balanceAfter: number;
  warning: string | null;
};
const adjustStockRef = makeFunctionReference<
  "action",
  AdjustStockArgs,
  AdjustStockResult
>("inventory:adjustStock");

export function ProductStockCorrectionDialog({
  open,
  onOpenChange,
  organizationId,
  product,
}: ProductStockCorrectionDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const adjustStock = useAction(adjustStockRef);
  const { totalsByProductId } = useSupabaseProductStockTotals(organizationId);

  const [newQuantity, setNewQuantity] = useState("");
  const [correctionReason, setCorrectionReason] = useState<CorrectionReason>("recount");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setNewQuantity("");
      setCorrectionReason("recount");
      setNote("");
    }
  }, [open, product?._id]);

  const stockSummary = product ? totalsByProductId.get(product._id) : undefined;
  const currentBalance = stockSummary?.total ?? 0;
  const unit = product?.stockUnit?.trim() || "";

  const parsedQuantity = (() => {
    if (!newQuantity.trim()) return null;
    const parsed = parseFloat(newQuantity.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
  })();

  const reasonLabels: Record<CorrectionReason, string> = {
    recount: t("products.stock.correction.reason.recount", { defaultValue: "Korekta po przeliczeniu" }),
    damage: t("products.stock.correction.reason.damage", { defaultValue: "Uszkodzenie" }),
    loss: t("products.stock.correction.reason.loss", { defaultValue: "Zagubienie" }),
    consumption: t("products.stock.correction.reason.consumption", { defaultValue: "Zużycie poza systemem" }),
    other: t("products.stock.correction.reason.other", { defaultValue: "Inne" }),
  };

  const handleSubmit = async () => {
    if (!product || parsedQuantity == null) return;
    setIsSubmitting(true);
    try {
      const reasonText = reasonLabels[correctionReason];
      const composedNote = note.trim()
        ? `${reasonText}: ${note.trim()}`
        : reasonText;

      await adjustStock({
        organizationId: organizationId as Id<"organizations">,
        productId: product._id,
        locationId: null,
        setTo: parsedQuantity,
        reason: "manual_adjust",
        note: composedNote,
      });
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.productStockLevels.list(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.productStockMovements.list(organizationId),
      });
      toast.success(
        t("products.stock.correction.success", {
          defaultValue: "Korekta stanu zapisana.",
        }),
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "products.stock.correction.error",
          defaultValue: "Nie udało się zapisać korekty stanu.",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!product) return null;

  const formatBalance = (value: number) =>
    `${value}${unit ? ` ${unit}` : ""}`;
  const delta = parsedQuantity != null ? parsedQuantity - currentBalance : null;
  const canSubmit = parsedQuantity != null && parsedQuantity !== currentBalance && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("products.stock.correction.title", {
              defaultValue: "Korekta stanu",
            })}
          </DialogTitle>
          <DialogDescription>{product.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("products.stock.correction.currentBalance", {
                  defaultValue: "Aktualny stan",
                })}
              </span>
              <span className="font-medium">{formatBalance(currentBalance)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="correction-quantity">
              {t("products.stock.correction.newQuantityLabel", {
                defaultValue: "Nowy stan",
              })}
              <span className="text-destructive"> *</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="correction-quantity"
                type="text"
                inputMode="decimal"
                value={newQuantity}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                    setNewQuantity(v);
                  }
                }}
                placeholder={String(currentBalance)}
                autoFocus
              />
              {unit && (
                <span className="text-sm text-muted-foreground">{unit}</span>
              )}
            </div>
            {delta != null && (
              <p className="text-xs text-muted-foreground">
                {t("products.stock.correction.delta", {
                  defaultValue: "Różnica: {{value}}",
                  value: delta > 0 ? `+${delta}` : String(delta),
                })}
                {unit ? ` ${unit}` : ""}
                {` (${formatBalance(currentBalance)} → ${formatBalance(parsedQuantity!)})`}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="correction-reason">
              {t("products.stock.correction.reasonLabel", {
                defaultValue: "Powód korekty",
              })}
              <span className="text-destructive"> *</span>
            </Label>
            <Select
              value={correctionReason}
              onValueChange={(v) => setCorrectionReason(v as CorrectionReason)}
            >
              <SelectTrigger id="correction-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(reasonLabels) as CorrectionReason[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {reasonLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="correction-note">
              {t("products.stock.correction.noteLabel", {
                defaultValue: "Notatka",
              })}
              <span className="ml-1 text-xs text-muted-foreground">
                {t("common.optional", { defaultValue: "(opcjonalna)" })}
              </span>
            </Label>
            <Textarea
              id="correction-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("products.stock.correction.notePlaceholder", {
                defaultValue: "Dodatkowe informacje…",
              })}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
