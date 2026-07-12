import { useEffect, useMemo, useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSupabaseGabinetLocationsList } from "@/hooks/use-supabase-gabinet-locations";
import { useSupabaseProductStockTotals } from "@/hooks/use-supabase-products";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatActionError } from "@/lib/format-action-error";
import { cn } from "@/lib/utils";
import type { MappedProduct } from "@/lib/supabase/mappers/products";

interface ProductStockAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  product: MappedProduct | null;
}

type Mode = "receive" | "issue";

const ALL_LOCATIONS_VALUE = "__all__";

// `convex/inventory.ts` also exports a plain helper `applyMovementInternal`,
// which inflates the inferred module type enough that going through
// `api.inventory.adjustStock` trips TS's "type instantiation excessively deep"
// guard. Build a FunctionReference by name instead, which keeps the call site
// strictly typed without re-instantiating the whole API surface.
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

export function ProductStockAdjustDialog({
  open,
  onOpenChange,
  organizationId,
  product,
}: ProductStockAdjustDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const adjustStock = useAction(adjustStockRef);
  const { data: locations = [] } = useSupabaseGabinetLocationsList(
    organizationId,
    { activeOnly: true },
  );
  const { totalsByProductId } = useSupabaseProductStockTotals(organizationId);

  const [mode, setMode] = useState<Mode>("receive");
  const [quantity, setQuantity] = useState("");
  const [locationId, setLocationId] = useState<string>(ALL_LOCATIONS_VALUE);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens for a new product.
  useEffect(() => {
    if (open) {
      setMode("receive");
      setQuantity("");
      setLocationId(ALL_LOCATIONS_VALUE);
      setNote("");
    }
  }, [open, product?._id]);

  const stockSummary = product ? totalsByProductId.get(product._id) : undefined;
  const unit = product?.stockUnit?.trim() || "";

  const currentBalance = useMemo(() => {
    if (!stockSummary) return 0;
    const targetLocationId =
      locationId === ALL_LOCATIONS_VALUE ? null : locationId;
    const match = stockSummary.byLocation.find(
      (row) => row.locationId === targetLocationId,
    );
    return match?.quantity ?? 0;
  }, [stockSummary, locationId]);

  const parsedQuantity = (() => {
    if (!quantity.trim()) return null;
    const parsed = parseFloat(quantity.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  })();

  const delta = parsedQuantity == null ? null : mode === "receive" ? parsedQuantity : -parsedQuantity;
  const projectedBalance = delta == null ? currentBalance : currentBalance + delta;
  const wouldGoNegative = projectedBalance < 0;

  const handleSubmit = async () => {
    if (!product || parsedQuantity == null || delta == null) return;
    setIsSubmitting(true);
    try {
      const result = await adjustStock({
        organizationId: organizationId as Id<"organizations">,
        productId: product._id,
        locationId:
          locationId === ALL_LOCATIONS_VALUE
            ? null
            : (locationId as Id<"gabinetLocations">),
        delta,
        reason: mode === "receive" ? "warehouse_receive" : "manual_adjust",
        note: note.trim() || null,
      });
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.productStockLevels.list(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.productStockMovements.list(organizationId),
      });
      if (result.warning === "negative_stock") {
        toast.warning(
          t("products.stock.adjust.negativeWarning", {
            defaultValue:
              "Stan magazynowy spadł poniżej zera. Sprawdź historię ruchów i skoryguj braki.",
          }),
        );
      } else {
        toast.success(
          t("products.stock.adjust.success", {
            defaultValue: "Stan magazynowy zaktualizowany.",
          }),
        );
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "products.stock.adjust.error",
          defaultValue: "Nie udało się zaktualizować stanu magazynowego.",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!product) return null;

  const canSubmit = parsedQuantity != null && !isSubmitting;
  const formatBalance = (value: number) =>
    `${value}${unit ? ` ${unit}` : ""}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("products.stock.adjust.title", {
              defaultValue: "Przyjmij / wydaj towar",
            })}
          </DialogTitle>
          <DialogDescription>{product.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("products.stock.adjust.currentBalance", {
                  defaultValue: "Aktualny stan",
                })}
              </span>
              <span className="font-medium">
                {formatBalance(currentBalance)}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              {t("products.stock.adjust.modeLabel", {
                defaultValue: "Operacja",
              })}
            </Label>
            <RadioGroup
              value={mode}
              onValueChange={(value) => setMode(value as Mode)}
              className="grid grid-cols-2 gap-2"
            >
              <label
                htmlFor="stock-mode-receive"
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border p-3 transition-colors hover:bg-muted/30",
                  mode === "receive" && "border-primary bg-primary/5",
                )}
              >
                <RadioGroupItem value="receive" id="stock-mode-receive" />
                <span className="text-sm font-medium">
                  {t("products.stock.adjust.receive", {
                    defaultValue: "Przyjęcie (+)",
                  })}
                </span>
              </label>
              <label
                htmlFor="stock-mode-issue"
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border p-3 transition-colors hover:bg-muted/30",
                  mode === "issue" && "border-primary bg-primary/5",
                )}
              >
                <RadioGroupItem value="issue" id="stock-mode-issue" />
                <span className="text-sm font-medium">
                  {t("products.stock.adjust.issue", {
                    defaultValue: "Wydanie (−)",
                  })}
                </span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stock-quantity">
              {t("products.stock.adjust.quantityLabel", {
                defaultValue: "Ilość",
              })}
              <span className="text-destructive"> *</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="stock-quantity"
                type="text"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                    setQuantity(v);
                  }
                }}
                placeholder="0"
                autoFocus
              />
              {unit && (
                <span className="text-sm text-muted-foreground">{unit}</span>
              )}
            </div>
            {parsedQuantity != null && (
              <p
                className={cn(
                  "text-xs",
                  wouldGoNegative
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {t("products.stock.adjust.projected", {
                  defaultValue: "Nowy stan: {{value}}",
                  value: formatBalance(projectedBalance),
                })}
                {wouldGoNegative
                  ? ` — ${t("products.stock.adjust.negativeHint", {
                      defaultValue: "uwaga: stan ujemny",
                    })}`
                  : ""}
              </p>
            )}
          </div>

          {locations.length > 0 && (
            <div className="space-y-1.5">
              <Label>
                {t("products.stock.adjust.locationLabel", {
                  defaultValue: "Lokalizacja",
                })}
              </Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_LOCATIONS_VALUE}>
                    {t("products.stock.adjust.locationNone", {
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

          <div className="space-y-1.5">
            <Label htmlFor="stock-note">
              {t("products.stock.adjust.noteLabel", {
                defaultValue: "Notatka",
              })}
            </Label>
            <Textarea
              id="stock-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("products.stock.adjust.notePlaceholder", {
                defaultValue: "Powód operacji, numer dokumentu, …",
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
