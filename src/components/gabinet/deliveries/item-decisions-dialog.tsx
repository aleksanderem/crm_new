import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Id } from "@cvx/_generated/dataModel";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
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
import { AlertCircle, CheckCircle, Loader2 } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import type {
  MatchingProposalsFE,
  ParsedInvoiceItemFE,
  ProductCandidate,
  ItemDecision,
  ItemDecisions,
  DecisionType,
  CreateLaterType,
  PostDeliveryResult,
} from "./types";
import { isDecisionComplete, fmtMoney } from "./types";

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

const CREATE_LATER_OPTIONS: Array<{ value: CreateLaterType; label: string }> = [
  { value: "treatment_product", label: "Preparat do zabiegu" },
  { value: "disposable", label: "Materiał jednorazowy" },
  { value: "sale_product", label: "Produkt do sprzedaży" },
  { value: "consumable", label: "Materiał eksploatacyjny" },
];

const DECISION_LABELS: Record<DecisionType, string> = {
  accepted: "Dopasuj",
  choose_product: "Wybierz inny",
  create_later: "Utwórz później",
  non_inventory: "Niemagazynowa",
};

function decisionBadge(d: ItemDecision | null) {
  if (!d) {
    return (
      <Badge className="text-xs py-0 px-1.5 h-5 font-normal border bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800">
        Wymaga decyzji
      </Badge>
    );
  }
  if (d.type === "non_inventory") {
    return (
      <Badge className="text-xs py-0 px-1.5 h-5 font-normal border bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300 border-slate-200 dark:border-slate-700">
        Niemagazynowa
      </Badge>
    );
  }
  if (d.type === "create_later") {
    if (!d.createLaterType) {
      return (
        <Badge className="text-xs py-0 px-1.5 h-5 font-normal border bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800">
          Wybierz typ
        </Badge>
      );
    }
    return (
      <Badge className="text-xs py-0 px-1.5 h-5 font-normal border bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 border-violet-200 dark:border-violet-800">
        Do utworzenia
      </Badge>
    );
  }
  if (!d.productId) {
    return (
      <Badge className="text-xs py-0 px-1.5 h-5 font-normal border bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800">
        Wybierz produkt
      </Badge>
    );
  }
  return (
    <Badge className="text-xs py-0 px-1.5 h-5 font-normal border bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
      Potwierdzona
    </Badge>
  );
}

export function ItemDecisionsDialog({
  open,
  onOpenChange,
  deliveryId,
  organizationId,
  proposals,
  analysisItems,
  savedDecisions,
  products,
  onSave,
  saveAction,
  postDeliveryAction,
  onPosted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  deliveryId: string;
  organizationId: Id<"organizations">;
  proposals: MatchingProposalsFE;
  analysisItems: ParsedInvoiceItemFE[];
  savedDecisions: ItemDecisions | null;
  products: Array<{ _id: string; name: string; sku?: string | null }>;
  onSave: (decisions: ItemDecisions) => void;
  saveAction: (args: { organizationId: Id<"organizations">; deliveryId: string; decisions: unknown }) => Promise<void>;
  postDeliveryAction?: (args: { organizationId: Id<"organizations">; deliveryId: string }) => Promise<PostDeliveryResult>;
  onPosted?: () => void;
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postSummary, setPostSummary] = useState<PostDeliveryResult | null>(null);

  useEffect(() => {
    if (!open) setPostSummary(null);
  }, [open]);

  const initDecisions = useCallback((): (ItemDecision | null)[] => {
    if (savedDecisions && Array.isArray(savedDecisions.items) && savedDecisions.items.length === proposals.items.length) {
      return savedDecisions.items as (ItemDecision | null)[];
    }
    return proposals.items.map((item) => {
      if (item.status === "matched" && item.matched) {
        return { type: "accepted" as const, productId: item.matched.productId };
      }
      if (item.status === "non_inventory_candidate") {
        return null;
      }
      return null;
    });
  }, [proposals, savedDecisions]);

  const [decisions, setDecisions] = useState<(ItemDecision | null)[]>(initDecisions);

  useEffect(() => {
    if (open) setDecisions(initDecisions());
  }, [open, initDecisions]);

  const setDecision = (idx: number, d: ItemDecision | null) => {
    setDecisions((prev) => prev.map((v, i) => (i === idx ? d : v)));
  };

  const counts = useMemo(() => {
    let confirmed = 0, createLater = 0, nonInventory = 0, unresolved = 0;
    for (const d of decisions) {
      if (!isDecisionComplete(d)) { unresolved++; continue; }
      if (d!.type === "non_inventory") nonInventory++;
      else if (d!.type === "create_later") createLater++;
      else confirmed++;
    }
    return { confirmed, createLater, nonInventory, unresolved };
  }, [decisions]);

  const unresolvedIndices = useMemo(
    () => decisions.map((d, i) => (!isDecisionComplete(d) ? i : -1)).filter((i) => i >= 0),
    [decisions],
  );

  const hasCreateLater = useMemo(
    () => decisions.some((d) => d?.type === "create_later"),
    [decisions],
  );

  const handleSave = async () => {
    if (unresolvedIndices.length > 0) return;
    setSaving(true);
    try {
      const saved: ItemDecisions = { decidedAt: Date.now(), items: decisions };
      await saveAction({ organizationId, deliveryId, decisions: saved });
      onSave(saved);
      onOpenChange(false);
      toast.success(t("gabinet.deliveries.decisions.saveSuccess", "Decyzje zapisane."));
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.deliveries.decisions.saveError",
          defaultValue: "Nie udało się zapisać decyzji.",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePostFromDecisions = async () => {
    if (!postDeliveryAction || unresolvedIndices.length > 0 || hasCreateLater) return;
    setPosting(true);
    try {
      const saved: ItemDecisions = { decidedAt: Date.now(), items: decisions };
      await saveAction({ organizationId, deliveryId, decisions: saved });
      onSave(saved);
      const result = await postDeliveryAction({ organizationId, deliveryId });
      onPosted?.();
      setPostSummary(result);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.deliveries.decisions.postError",
          defaultValue: "Nie udało się zatwierdzić dostawy.",
        }),
      );
    } finally {
      setPosting(false);
    }
  };

  if (postSummary) {
    const manuallyMatched = postSummary.movementsCreated - postSummary.autoMatchedCount;
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" variant="stroke" />
              {t("gabinet.deliveries.decisions.postDoneTitle", "Dostawa zaksięgowana")}
            </DialogTitle>
            <DialogDescription>
              {t("gabinet.deliveries.decisions.postDoneDesc", "Stany magazynowe zostały zaktualizowane.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("gabinet.deliveries.decisions.summaryImported", "Produktów dodanych do magazynu")}</span>
              <span className="font-semibold tabular-nums">{postSummary.movementsCreated}</span>
            </div>
            {postSummary.autoMatchedCount > 0 && (
              <div className="flex justify-between pl-4 text-xs text-muted-foreground">
                <span>{t("gabinet.deliveries.decisions.summaryAutoMatched", "w tym dopasowanych automatycznie (AI)")}</span>
                <span className="tabular-nums">{postSummary.autoMatchedCount}</span>
              </div>
            )}
            {manuallyMatched > 0 && (
              <div className="flex justify-between pl-4 text-xs text-muted-foreground">
                <span>{t("gabinet.deliveries.decisions.summaryManualMatched", "w tym dopasowanych ręcznie")}</span>
                <span className="tabular-nums">{manuallyMatched}</span>
              </div>
            )}
            {postSummary.nonInventorySkipped > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("gabinet.deliveries.decisions.summaryNonInventory", "Pozycji niemagazynowych pominięto")}</span>
                <span className="font-semibold tabular-nums">{postSummary.nonInventorySkipped}</span>
              </div>
            )}
            {postSummary.newMappingsLearned > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("gabinet.deliveries.decisions.summaryNewMappings", "Nowych mapowań zapamiętano")}</span>
                <span className="font-semibold tabular-nums">{postSummary.newMappingsLearned}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t("common.close", "Zamknij")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {t("gabinet.deliveries.decisions.title", "Weryfikacja pozycji faktury")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "gabinet.deliveries.decisions.description",
              "Przypisz decyzję do każdej pozycji faktury. Decyzje są zapisywane osobno od dopasowania i danych OCR.",
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Summary bar */}
        <div className="flex flex-wrap gap-3 rounded-md bg-muted/30 px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            {t("gabinet.deliveries.decisions.confirmed", "Potwierdzone")}: <strong>{counts.confirmed}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
            {t("gabinet.deliveries.decisions.createLater", "Do utworzenia")}: <strong>{counts.createLater}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
            {t("gabinet.deliveries.decisions.nonInventory", "Niemagazynowe")}: <strong>{counts.nonInventory}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            {t("gabinet.deliveries.decisions.unresolved", "Bez decyzji")}: <strong>{counts.unresolved}</strong>
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
          {proposals.items.map((item, idx) => {
            const ai = analysisItems[idx];
            const decision = decisions[idx] ?? null;
            const candidates: ProductCandidate[] =
              item.status === "matched" && item.matched
                ? [item.matched, ...(item.suggestions ?? [])]
                : item.suggestions ?? [];
            const availableTypes: DecisionType[] =
              item.status === "unmatched"
                ? ["choose_product", "create_later", "non_inventory"]
                : ["accepted", "choose_product", "create_later", "non_inventory"];

            return (
              <div key={idx} className="rounded-md border p-3 space-y-2">
                {/* Item header */}
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{item.invoiceName}</span>
                      {itemStatusBadge(item.status)}
                      {decisionBadge(decision)}
                    </div>
                    {ai && (ai.quantity != null || ai.unitPriceGross != null || ai.unitPrice != null) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ai.quantity != null && (
                          <span>{ai.quantity}{ai.unit ? ` ${ai.unit}` : " szt."}</span>
                        )}
                        {ai.quantity != null && (ai.unitPriceGross != null || ai.unitPrice != null) && (
                          <span> · </span>
                        )}
                        {(ai.unitPriceGross != null || ai.unitPrice != null) && (
                          <span>
                            {fmtMoney(ai.unitPriceGross ?? ai.unitPrice!)} zł/szt.
                            {ai.vatCode ? ` (VAT ${ai.vatCode})` : ""}
                          </span>
                        )}
                      </p>
                    )}
                    {item.status === "non_inventory_candidate" && item.handlingHint && (
                      <p className="text-xs text-muted-foreground italic mt-0.5 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" variant="stroke" />
                        {item.handlingHint}
                      </p>
                    )}
                  </div>
                </div>

                {/* Decision type selector */}
                <div className="flex flex-wrap gap-1">
                  {availableTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        if (type === "non_inventory") {
                          setDecision(idx, { type: "non_inventory" });
                        } else if (type === "create_later") {
                          setDecision(idx, { type: "create_later" });
                        } else if (type === "accepted") {
                          setDecision(idx, {
                            type: "accepted",
                            productId: candidates[0]?.productId ?? "",
                          });
                        } else {
                          setDecision(idx, { type: "choose_product", productId: "" });
                        }
                      }}
                      className={cn(
                        "rounded border px-2 py-0.5 text-xs transition-colors",
                        decision?.type === type
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-input hover:bg-muted",
                      )}
                    >
                      {DECISION_LABELS[type]}
                    </button>
                  ))}
                </div>

                {/* Product selector for accepted / choose_product */}
                {(decision?.type === "accepted" || decision?.type === "choose_product") && (
                  <Select
                    value={decision.productId ?? ""}
                    onValueChange={(v) =>
                      setDecision(idx, { ...decision, productId: v })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue
                        placeholder={t(
                          "gabinet.deliveries.decisions.selectProduct",
                          "Wybierz produkt…",
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.length > 0 && (
                        <>
                          {candidates.map((c) => (
                            <SelectItem key={c.productId} value={c.productId}>
                              {c.productName}
                              {c.matchReason === "exact_name" || c.matchReason === "saved_mapping" ? (
                                <span className="ml-1.5 text-xs text-emerald-600 dark:text-emerald-400">✓</span>
                              ) : null}
                            </SelectItem>
                          ))}
                          <div className="my-1 border-t" />
                        </>
                      )}
                      {products.map((p) => (
                        <SelectItem key={p._id} value={p._id}>
                          {p.name}{p.sku ? ` (${p.sku})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Product type selector for create_later */}
                {decision?.type === "create_later" && (
                  <Select
                    value={decision.createLaterType ?? ""}
                    onValueChange={(v) =>
                      setDecision(idx, { ...decision, createLaterType: v as CreateLaterType })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue
                        placeholder={t(
                          "gabinet.deliveries.decisions.selectProductType",
                          "Wybierz typ produktu…",
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {CREATE_LATER_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })}
        </div>

        {unresolvedIndices.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" variant="stroke" />
            <span>
              {t(
                "gabinet.deliveries.decisions.unresolvedWarning",
                "Pozycje bez decyzji: {{items}}. Uzupełnij wszystkie decyzje przed zapisem.",
                {
                  items: unresolvedIndices
                    .map((i) => proposals.items[i]?.invoiceName ?? `#${i + 1}`)
                    .join(", "),
                },
              )}
            </span>
          </div>
        )}
        {hasCreateLater && unresolvedIndices.length === 0 && (
          <div className="flex items-start gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" variant="stroke" />
            <span>
              {t(
                "gabinet.deliveries.decisions.createLaterBlocking",
                "Pozycje oznaczone „Utwórz później” blokują zatwierdzenie dostawy. Zmień decyzję na inną, aby odblokować zaksięgowanie.",
              )}
            </span>
          </div>
        )}

        <DialogFooter className="border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving || posting}
          >
            {t("common.cancel", "Anuluj")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleSave}
            disabled={saving || posting || unresolvedIndices.length > 0}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" variant="stroke" />}
            {t("gabinet.deliveries.decisions.save", "Zapisz decyzje")}
          </Button>
          {postDeliveryAction && (
            <Button
              type="button"
              onClick={handlePostFromDecisions}
              disabled={posting || saving || unresolvedIndices.length > 0 || hasCreateLater}
            >
              {posting && <Loader2 className="mr-2 h-4 w-4 animate-spin" variant="stroke" />}
              <CheckCircle className="mr-2 h-4 w-4" variant="stroke" />
              {t("gabinet.deliveries.decisions.post", "Zatwierdź dostawę")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
