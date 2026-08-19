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
import { useActiveLocation } from "@/contexts/gabinet-location-context";
import { useSupabaseProductStockTotals } from "@/hooks/use-supabase-products";
import { useSupabaseGabinetPatientsList } from "@/hooks/use-supabase-gabinet-patients";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatActionError } from "@/lib/format-action-error";
import { cn } from "@/lib/utils";
import type { MappedProduct } from "@/lib/supabase/mappers/products";

interface ProductSellDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  product: MappedProduct | null;
}

type Mode = "sell" | "return";
type PaymentMethod = "cash" | "card" | "transfer" | "other";

const ALL_LOCATIONS_VALUE = "__all__";

type SellProductArgs = {
  organizationId: Id<"organizations">;
  productId: string;
  quantity: number;
  salePrice: number;
  locationId: Id<"gabinetLocations"> | null;
  clientId?: string;
  paymentMethod?: string;
};
type SellReturnArgs = {
  organizationId: Id<"organizations">;
  productId: string;
  quantity: number;
  salePrice: number;
  locationId: Id<"gabinetLocations"> | null;
  clientId?: string;
  paymentMethod?: string;
  note?: string;
};

const sellProductRef = makeFunctionReference<
  "action",
  SellProductArgs,
  { negativeStock: boolean }
>("magazyn/movements:sellProductStandalone");

const sellReturnRef = makeFunctionReference<
  "action",
  SellReturnArgs,
  { movementId: string; balanceAfter: number }
>("magazyn/movements:sellReturnStandalone");

export function ProductSellDialog({
  open,
  onOpenChange,
  organizationId,
  product,
}: ProductSellDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const sellProduct = useAction(sellProductRef);
  const sellReturn = useAction(sellReturnRef);

  const { data: locations = [] } = useSupabaseGabinetLocationsList(
    organizationId,
    { activeOnly: true },
  );
  const { totalsByProductId } = useSupabaseProductStockTotals(organizationId);
  const { activeLocationId, setActiveLocationId } = useActiveLocation();

  const [mode, setMode] = useState<Mode>("sell");
  const [quantity, setQuantity] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [note, setNote] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedPatientName, setSelectedPatientName] = useState<string>("");
  const [patientDropdownOpen, setPatientDropdownOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: patientResults = [] } = useSupabaseGabinetPatientsList(
    organizationId,
    {
      search: patientSearch,
      limit: 8,
      enabled: open && patientSearch.length >= 2 && !selectedPatientId,
    },
  );

  useEffect(() => {
    if (open) {
      setMode("sell");
      setQuantity("");
      setSalePrice(product?.salePrice != null ? String(product.salePrice) : "");
      setPaymentMethod("");
      setNote("");
      setPatientSearch("");
      setSelectedPatientId(null);
      setSelectedPatientName("");
      setPatientDropdownOpen(false);
    }
  }, [open, product?._id, product?.salePrice]);

  const stockSummary = product ? totalsByProductId.get(product._id) : undefined;
  const unit = product?.stockUnit?.trim() || "";

  const currentBalance = useMemo(() => {
    if (!stockSummary) return 0;
    const match = stockSummary.byLocation.find(
      (row) => row.locationId === activeLocationId,
    );
    return match?.quantity ?? 0;
  }, [stockSummary, activeLocationId]);

  const parsedQuantity = (() => {
    if (!quantity.trim()) return null;
    const parsed = parseFloat(quantity.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  })();

  const parsedSalePrice = (() => {
    if (!salePrice.trim()) return null;
    const parsed = parseFloat(salePrice.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
  })();

  const projectedBalance =
    parsedQuantity == null
      ? currentBalance
      : mode === "sell"
        ? currentBalance - parsedQuantity
        : currentBalance + parsedQuantity;
  const wouldGoNegative = mode === "sell" && projectedBalance < 0;

  const formatBalance = (value: number) =>
    `${value}${unit ? ` ${unit}` : ""}`;

  const handleSelectPatient = (id: string, name: string) => {
    setSelectedPatientId(id);
    setSelectedPatientName(name);
    setPatientSearch("");
    setPatientDropdownOpen(false);
  };

  const handleClearPatient = () => {
    setSelectedPatientId(null);
    setSelectedPatientName("");
    setPatientSearch("");
  };

  const handleSubmit = async () => {
    if (!product || parsedQuantity == null || parsedSalePrice == null) return;
    setIsSubmitting(true);
    try {
      const commonArgs = {
        organizationId: organizationId as Id<"organizations">,
        productId: product._id,
        quantity: parsedQuantity,
        salePrice: parsedSalePrice,
        locationId: activeLocationId as Id<"gabinetLocations"> | null,
        clientId: selectedPatientId ?? undefined,
        paymentMethod: paymentMethod || undefined,
      };

      if (mode === "sell") {
        const result = await sellProduct(commonArgs);
        if (result.negativeStock) {
          toast.warning(
            t("products.sell.negativeStockWarning", {
              defaultValue:
                "Sprzedaż zarejestrowana, ale stan magazynowy spadł poniżej zera.",
            }),
          );
        } else {
          toast.success(
            t("products.sell.success", {
              defaultValue: "Sprzedaż zarejestrowana.",
            }),
          );
        }
      } else {
        await sellReturn({ ...commonArgs, note: note.trim() || undefined });
        toast.success(
          t("products.sell.returnSuccess", {
            defaultValue: "Zwrot zarejestrowany.",
          }),
        );
      }

      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.productStockLevels.list(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.productStockMovements.list(organizationId),
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: mode === "sell" ? "products.sell.error" : "products.sell.returnError",
          defaultValue:
            mode === "sell"
              ? "Nie udało się zarejestrować sprzedaży."
              : "Nie udało się zarejestrować zwrotu.",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!product) return null;

  const canSubmit = parsedQuantity != null && parsedSalePrice != null && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("products.sell.title", {
              defaultValue: "Sprzedaż bezpośrednia",
            })}
          </DialogTitle>
          <DialogDescription>{product.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current balance */}
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

          {/* Mode */}
          <div className="space-y-1.5">
            <Label>
              {t("products.sell.modeLabel", { defaultValue: "Operacja" })}
            </Label>
            <RadioGroup
              value={mode}
              onValueChange={(value) => setMode(value as Mode)}
              className="grid grid-cols-2 gap-2"
            >
              <label
                htmlFor="sell-mode-sell"
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border p-3 transition-colors hover:bg-muted/30",
                  mode === "sell" && "border-primary bg-primary/5",
                )}
              >
                <RadioGroupItem value="sell" id="sell-mode-sell" />
                <span className="text-sm font-medium">
                  {t("products.sell.modeSell", {
                    defaultValue: "Sprzedaż (−)",
                  })}
                </span>
              </label>
              <label
                htmlFor="sell-mode-return"
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border p-3 transition-colors hover:bg-muted/30",
                  mode === "return" && "border-primary bg-primary/5",
                )}
              >
                <RadioGroupItem value="return" id="sell-mode-return" />
                <span className="text-sm font-medium">
                  {t("products.sell.modeReturn", { defaultValue: "Zwrot (+)" })}
                </span>
              </label>
            </RadioGroup>
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <Label htmlFor="sell-quantity">
              {t("products.stock.adjust.quantityLabel", {
                defaultValue: "Ilość",
              })}
              <span className="text-destructive"> *</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="sell-quantity"
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

          {/* Sale price */}
          <div className="space-y-1.5">
            <Label htmlFor="sell-price">
              {t("products.sell.priceLabel", {
                defaultValue: "Cena sprzedaży (brutto)",
              })}
              <span className="text-destructive"> *</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="sell-price"
                type="text"
                inputMode="decimal"
                value={salePrice}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                    setSalePrice(v);
                  }
                }}
                placeholder="0.00"
              />
              <span className="text-sm text-muted-foreground">PLN</span>
            </div>
          </div>

          {/* Payment method */}
          <div className="space-y-1.5">
            <Label>
              {t("gabinet.packages.paymentMethod", {
                defaultValue: "Metoda płatności",
              })}
            </Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as PaymentMethod | "")}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={t("products.sell.paymentMethodPlaceholder", {
                    defaultValue: "Opcjonalnie",
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">
                  {t("gabinet.packages.paymentMethods.cash", {
                    defaultValue: "Gotówka",
                  })}
                </SelectItem>
                <SelectItem value="card">
                  {t("gabinet.packages.paymentMethods.card", {
                    defaultValue: "Karta",
                  })}
                </SelectItem>
                <SelectItem value="transfer">
                  {t("gabinet.packages.paymentMethods.transfer", {
                    defaultValue: "Przelew",
                  })}
                </SelectItem>
                <SelectItem value="other">
                  {t("gabinet.packages.paymentMethods.other", {
                    defaultValue: "Inna",
                  })}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Location */}
          {locations.length > 0 && (
            <div className="space-y-1.5">
              <Label>
                {t("products.stock.adjust.locationLabel", {
                  defaultValue: "Lokalizacja",
                })}
              </Label>
              <Select
                value={activeLocationId ?? ALL_LOCATIONS_VALUE}
                onValueChange={(v) =>
                  setActiveLocationId(
                    v === ALL_LOCATIONS_VALUE ? null : v,
                  )
                }
              >
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

          {/* Patient / client (optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="sell-patient">
              {t("products.sell.patientLabel", {
                defaultValue: "Pacjent / klient (opcjonalnie)",
              })}
            </Label>
            {selectedPatientId ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="flex-1 font-medium">{selectedPatientName}</span>
                <button
                  type="button"
                  onClick={handleClearPatient}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t("common.clear", { defaultValue: "Wyczyść" })}
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  id="sell-patient"
                  type="text"
                  value={patientSearch}
                  onChange={(e) => {
                    setPatientSearch(e.target.value);
                    setPatientDropdownOpen(e.target.value.length >= 2);
                  }}
                  onBlur={() => {
                    setTimeout(() => setPatientDropdownOpen(false), 150);
                  }}
                  onFocus={() => {
                    if (patientSearch.length >= 2) setPatientDropdownOpen(true);
                  }}
                  placeholder={t("products.sell.patientSearchPlaceholder", {
                    defaultValue: "Wyszukaj pacjenta…",
                  })}
                />
                {patientDropdownOpen && patientResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                    <ul className="max-h-40 overflow-y-auto py-1">
                      {patientResults.map((p) => (
                        <li key={p._id}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectPatient(
                                p._id,
                                `${p.firstName} ${p.lastName}`,
                              );
                            }}
                          >
                            {p.firstName} {p.lastName}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Note (return mode only) */}
          {mode === "return" && (
            <div className="space-y-1.5">
              <Label htmlFor="sell-note">
                {t("products.stock.adjust.noteLabel", {
                  defaultValue: "Notatka",
                })}
              </Label>
              <Textarea
                id="sell-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("products.sell.notePlaceholder", {
                  defaultValue: "Powód zwrotu, numer dokumentu, …",
                })}
                rows={2}
              />
            </div>
          )}
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
            {mode === "sell"
              ? t("products.sell.submitSell", { defaultValue: "Zarejestruj sprzedaż" })
              : t("products.sell.submitReturn", { defaultValue: "Zarejestruj zwrot" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
