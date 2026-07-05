import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SidePanel } from "@/components/crm/side-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "@/lib/ez-icons";
import { useSupabaseProductsList } from "@/hooks/use-supabase-products";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatActionError } from "@/lib/format-action-error";

interface AddDeliveryPanelProps {
  organizationId: Id<"organizations">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddDeliveryPanel({
  organizationId,
  open,
  onOpenChange,
}: AddDeliveryPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const adjustStock = useAction(api.inventory.adjustStock);

  const { data: productsData } = useSupabaseProductsList(String(organizationId));

  const [productId, setProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const stockableProducts = useMemo(
    () => (productsData ?? []).filter((p) => p.isActive && p.trackStock),
    [productsData],
  );

  const selectedProduct = useMemo(
    () => stockableProducts.find((p) => p._id === productId),
    [stockableProducts, productId],
  );

  const parsedQuantity = Math.max(0, Number.parseFloat(quantity.replace(",", ".")) || 0);

  const reset = useCallback(() => {
    setProductId("");
    setQuantity("");
    setNote("");
  }, []);

  const handleSubmit = async () => {
    if (!selectedProduct || parsedQuantity <= 0) return;
    setSubmitting(true);
    try {
      await adjustStock({
        organizationId,
        productId: selectedProduct._id,
        delta: parsedQuantity,
        reason: "warehouse_receive",
        note: note.trim() || null,
      });

      toast.success(
        t("gabinet.inventory.deliveryAdded", "Dostawa przyjęta pomyślnie"),
      );
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.productStockLevels.list(String(organizationId)),
      });
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.productStockMovements.list(String(organizationId)),
      });
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.inventory.errors.deliveryFailed",
          defaultValue: "Nie udało się przyjąć dostawy.",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title={t("sidebar.gabinet.addDelivery", "Dodaj dostawę")}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t("gabinet.inventory.selectProduct", "Produkt")}</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger>
              <SelectValue
                placeholder={t(
                  "gabinet.inventory.selectProductPlaceholder",
                  "Wybierz produkt...",
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {stockableProducts.map((p) => (
                <SelectItem key={p._id} value={p._id}>
                  {p.name}
                  {p.sku ? ` (${p.sku})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(productsData ?? []).filter((p) => p.isActive).length > 0 &&
            stockableProducts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {t(
                  "gabinet.inventory.noStockableProducts",
                  "Brak produktów ze śledzeniem stanów magazynowych. Włącz śledzenie w ustawieniach produktu.",
                )}
              </p>
            )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="delivery-quantity">
            {t("gabinet.inventory.quantity", "Ilość")}
            {selectedProduct?.stockUnit ? ` (${selectedProduct.stockUnit})` : ""}
          </Label>
          <Input
            id="delivery-quantity"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={quantity}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                setQuantity(v);
              }
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="delivery-note">
            {t("gabinet.inventory.note", "Notatka (opcjonalnie)")}
          </Label>
          <Textarea
            id="delivery-note"
            rows={3}
            placeholder={t(
              "gabinet.inventory.notePlaceholder",
              "Nr faktury, dostawca, uwagi...",
            )}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <Button
          className="w-full"
          disabled={!productId || parsedQuantity <= 0 || submitting}
          onClick={handleSubmit}
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" variant="stroke" />}
          {t("gabinet.inventory.confirmDelivery", "Przyjmij dostawę")}
        </Button>
      </div>
    </SidePanel>
  );
}
