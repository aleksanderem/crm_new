import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Plus, X } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import type { MatchingProposalsFE, ParsedInvoiceItemFE, ProductCandidate, LineItem } from "./types";
import { fmtMoney } from "./types";

const STATUS_LABELS: Record<string, string> = {
  matched: "Dopasowano",
  suggestions: "Propozycje",
  unmatched: "Nie znaleziono",
  non_inventory_candidate: "Niemagazynowa",
};

const STATUS_CLASSES: Record<string, string> = {
  matched:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  suggestions:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  unmatched:
    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800",
  non_inventory_candidate:
    "bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300 border-slate-200 dark:border-slate-700",
};

function itemStatusBadge(status: string) {
  return (
    <Badge
      className={cn(
        "text-xs py-0 px-1.5 h-5 font-normal border",
        STATUS_CLASSES[status] ?? "",
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function VerifyMatchesDialog({
  open,
  onOpenChange,
  proposals,
  analysisItems,
  products,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  proposals: MatchingProposalsFE;
  analysisItems: ParsedInvoiceItemFE[];
  products: Array<{ _id: string; name: string; sku?: string | null }>;
  onApply: (items: LineItem[]) => void;
}) {
  const { t } = useTranslation();

  // Per-item decision: productId string → accept that product, "skip" → omit from result
  const [decisions, setDecisions] = useState<Record<number, string>>({});

  // Reset decisions whenever proposals change (e.g. on re-match)
  useEffect(() => {
    const init: Record<number, string> = {};
    proposals.items.forEach((item, idx) => {
      if (item.status === "matched" && item.matched) {
        init[idx] = item.matched.productId;
      } else {
        init[idx] = "skip";
      }
    });
    setDecisions(init);
  }, [proposals]);

  const acceptedCount = Object.values(decisions).filter((d) => d !== "skip").length;

  const handleApply = () => {
    const lineItems: LineItem[] = [];
    proposals.items.forEach((_, idx) => {
      const productId = decisions[idx];
      if (!productId || productId === "skip") return;
      const ai = analysisItems[idx];
      lineItems.push({
        id: crypto.randomUUID(),
        productId,
        quantity: ai?.quantity != null ? String(ai.quantity) : "1",
        unitPrice: ai?.unitPrice != null ? String(ai.unitPrice) : "",
        vatCode: ai?.vatCode ?? "",
        unitPriceGross: ai?.unitPriceGross != null ? String(ai.unitPriceGross) : "",
        lastEdited:
          ai?.unitPrice != null ? "net" : ai?.unitPriceGross != null ? "gross" : null,
        lotNumber: ai?.lotNumber ?? "",
        expiryDate: ai?.expiryDate ?? "",
      });
    });
    onApply(lineItems);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {t("gabinet.deliveries.verify.title", "Weryfikacja dopasowania pozycji")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "gabinet.deliveries.verify.description",
              "Sprawdź dopasowania pozycji faktury do produktów. Potwierdź lub zmień każde dopasowanie, a następnie kliknij Zastosuj.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
          {proposals.items.map((item, idx) => {
            const decision = decisions[idx] ?? "skip";
            const isSkipped = decision === "skip";
            const ai = analysisItems[idx];
            // Build candidate list: for "matched" put the matched product first
            const candidates: ProductCandidate[] =
              item.status === "matched" && item.matched
                ? [item.matched, ...(item.suggestions ?? [])]
                : item.suggestions ?? [];

            return (
              <div
                key={idx}
                className={cn(
                  "rounded-md border p-3 space-y-2 transition-opacity",
                  isSkipped && item.status !== "non_inventory_candidate" ? "opacity-60" : "",
                  isSkipped && item.status === "non_inventory_candidate" ? "opacity-40" : "",
                )}
              >
                {/* Item header: invoice name + status badge + quantity/price hint */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{item.invoiceName}</span>
                      {itemStatusBadge(item.status)}
                    </div>
                    {ai && (ai.quantity != null || ai.unitPriceGross != null || ai.unitPrice != null) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ai.quantity != null && (
                          <span>
                            {ai.quantity} {ai.unit ?? "szt."}
                          </span>
                        )}
                        {ai.quantity != null &&
                          (ai.unitPriceGross != null || ai.unitPrice != null) && (
                            <span> · </span>
                          )}
                        {(ai.unitPriceGross != null || ai.unitPrice != null) && (
                          <span>
                            {fmtMoney(ai.unitPriceGross ?? ai.unitPrice!)} zł/szt.
                            {ai.unitPriceGross != null ? " brutto" : " netto"}
                          </span>
                        )}
                        {ai.lotNumber && <span> · LOT: {ai.lotNumber}</span>}
                      </p>
                    )}
                  </div>
                  {/* Skip / restore toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      setDecisions((prev) => {
                        if (isSkipped) {
                          // Restore: pick first candidate or first product
                          const restore =
                            candidates[0]?.productId ?? products[0]?._id ?? "skip";
                          return { ...prev, [idx]: restore };
                        }
                        return { ...prev, [idx]: "skip" };
                      })
                    }
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors",
                      isSkipped
                        ? "hover:bg-muted hover:text-foreground"
                        : "hover:bg-destructive/10 hover:text-destructive",
                    )}
                    title={
                      isSkipped
                        ? t("gabinet.deliveries.verify.restore", "Przywróć")
                        : t("gabinet.deliveries.verify.skip", "Pomiń pozycję")
                    }
                  >
                    {isSkipped ? (
                      <Plus className="h-3.5 w-3.5" variant="stroke" />
                    ) : (
                      <X className="h-3.5 w-3.5" variant="stroke" />
                    )}
                  </button>
                </div>

                {/* Non-inventory hint */}
                {item.status === "non_inventory_candidate" && item.handlingHint && (
                  <p className="text-xs text-muted-foreground italic flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" variant="stroke" />
                    {item.handlingHint}
                  </p>
                )}

                {/* Product picker — hidden when item is skipped */}
                {!isSkipped && (
                  <Select
                    value={decision}
                    onValueChange={(v) => setDecisions((prev) => ({ ...prev, [idx]: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue
                        placeholder={t(
                          "gabinet.deliveries.verify.selectProduct",
                          "Wybierz produkt…",
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Candidates (matched/suggested) first */}
                      {candidates.length > 0 && (
                        <>
                          {candidates.map((c) => (
                            <SelectItem key={c.productId} value={c.productId}>
                              {c.productName}
                              {c.matchReason === "exact_name" && (
                                <span className="ml-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                                  ✓
                                </span>
                              )}
                            </SelectItem>
                          ))}
                          <div className="my-1 border-t" />
                        </>
                      )}
                      {/* All active stockable products */}
                      {products.map((p) => (
                        <SelectItem key={p._id} value={p._id}>
                          {p.name}
                          {p.sku ? ` (${p.sku})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-xs text-muted-foreground">
            {t(
              "gabinet.deliveries.verify.summary",
              "{{accepted}} z {{total}} pozycji zostanie dodanych do dostawy",
              { accepted: acceptedCount, total: proposals.items.length },
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel", "Anuluj")}
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            disabled={acceptedCount === 0}
          >
            {t("gabinet.deliveries.verify.apply", "Zastosuj ({{count}})", {
              count: acceptedCount,
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
