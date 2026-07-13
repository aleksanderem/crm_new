import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getExpiryStatus } from "@/lib/expiry-utils";
import { useAction, useMutation } from "convex/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { SidePanel } from "@/components/crm/side-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, TruckIcon, Loader2, CheckCircle, ChevronUp, ChevronDown, FileText, Sparkles, RefreshCw, AlertCircle, X } from "@/lib/ez-icons";
import { formatActionError } from "@/lib/format-action-error";
import { useSupabaseProductsList, useSupabaseProductStockTotals } from "@/hooks/use-supabase-products";
import { useSupabaseGabinetLocationsList } from "@/hooks/use-supabase-gabinet-locations";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/deliveries",
)({
  component: DeliveriesPage,
});

const NO_LOCATION = "__none__";

const VAT_OPTIONS = [
  { code: "23", label: "23%", rate: 23 },
  { code: "8",  label: "8%",  rate: 8 },
  { code: "5",  label: "5%",  rate: 5 },
  { code: "0",  label: "0%",  rate: 0 },
  { code: "zw", label: "zw.", rate: 0 },
  { code: "np", label: "np.", rate: 0 },
] as const;

type VatCode = typeof VAT_OPTIONS[number]["code"];

function vatRate(code: string): number | undefined {
  return VAT_OPTIONS.find((o) => o.code === code)?.rate;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function grossFromNet(net: number, code: string): string {
  const rate = vatRate(code);
  if (rate === undefined) return "";
  return String(round2(net * (1 + rate / 100)));
}

function netFromGross(gross: number, code: string): string {
  const rate = vatRate(code);
  if (rate === undefined) return "";
  if (rate === 0) return String(gross);
  return String(round2(gross / (1 + rate / 100)));
}

interface LineItem {
  id: string;
  productId: string;
  quantity: string;
  unitPrice: string;       // net
  vatCode: string;
  unitPriceGross: string;  // gross
  lastEdited: "net" | "gross" | null;
  lotNumber: string;
  expiryDate: string;
}

function newLine(): LineItem {
  return {
    id: crypto.randomUUID(),
    productId: "",
    quantity: "",
    unitPrice: "",
    vatCode: "",
    unitPriceGross: "",
    lastEdited: null,
    lotNumber: "",
    expiryDate: "",
  };
}

function parseNum(s: string): number | null {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) && v >= 0 ? v : null;
}

// ---------------------------------------------------------------------------
// Local types mirroring backend invoiceMatching.ts (no cross-boundary import)
// ---------------------------------------------------------------------------

interface ProductCandidate {
  productId: string;
  productName: string;
  matchReason: string;
}

interface ItemMatchResult {
  invoiceName: string;
  status: "matched" | "suggestions" | "unmatched" | "non_inventory_candidate";
  matched?: ProductCandidate;
  suggestions?: ProductCandidate[];
  handlingHint?: string;
}

interface MatchingProposalsFE {
  matchedAt: number;
  items: ItemMatchResult[];
}

interface ParsedInvoiceItemFE {
  productName: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  vatCode: string | null;
  unitPriceGross: number | null;
  lotNumber: string | null;
  expiryDate: string | null;
}

// ---------------------------------------------------------------------------
// Types for item decisions (#3055)
// ---------------------------------------------------------------------------

type DecisionType = "accepted" | "choose_product" | "create_later" | "non_inventory";
type CreateLaterType = "treatment_product" | "disposable" | "sale_product" | "consumable";

interface ItemDecision {
  type: DecisionType;
  productId?: string;
  createLaterType?: CreateLaterType;
}

interface ItemDecisions {
  decidedAt: number;
  items: (ItemDecision | null)[];
}

function isDecisionComplete(d: ItemDecision | null): boolean {
  if (!d) return false;
  if (d.type === "non_inventory") return true;
  if (d.type === "create_later") return !!d.createLaterType;
  return !!d.productId;
}

function statusBadge(status: string, t: ReturnType<typeof useTranslation>["t"]) {
  if (status === "posted") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
        {t("gabinet.deliveries.status.posted", "Zaksięgowana")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
      {t("gabinet.deliveries.status.draft", "Robocza")}
    </Badge>
  );
}



function formatDate(ms: number | null | undefined) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("pl-PL");
}

function fmtMoney(n: number) {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function InvoicePageViewer({
  pages,
  t,
}: {
  pages: Array<{ url: string | null; mimeType: string; position: number }>;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
    <div className="space-y-2">
      {pages.map((page, idx) => {
        if (!page.url) return null;
        const isImage = page.mimeType.startsWith("image/");
        return (
          <a
            key={idx}
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-md border overflow-hidden hover:border-ring transition-colors"
            title={`${t("gabinet.deliveries.invoicePage", "Strona")} ${page.position + 1}`}
          >
            {isImage ? (
              <img
                src={page.url}
                alt={`${t("gabinet.deliveries.invoicePage", "Strona")} ${page.position + 1}`}
                className="w-full object-contain"
              />
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors">
                <FileText className="h-8 w-8 text-muted-foreground shrink-0" variant="stroke" />
                <div>
                  <p className="font-medium text-sm">
                    {t("gabinet.deliveries.invoicePdf", "Faktura PDF")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("gabinet.deliveries.openInNewTab", "Kliknij, aby otworzyć")}
                  </p>
                </div>
              </div>
            )}
          </a>
        );
      })}
    </div>
  );
}

function DeliveriesPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();

  // @ts-ignore — TS2589: deep type instantiation in Convex codegen
  const listDeliveriesAction = useAction(api.warehouseDeliveries.listDeliveries);
  // @ts-ignore
  const getDeliveryAction = useAction(api.warehouseDeliveries.getDelivery);
  // @ts-ignore
  const createDeliveryAction = useAction(api.warehouseDeliveries.createDelivery);
  // @ts-ignore
  const updateDeliveryAction = useAction(api.warehouseDeliveries.updateDelivery);
  // @ts-ignore
  const postDeliveryAction = useAction(api.warehouseDeliveries.postDelivery);
  // @ts-ignore
  const cancelDeliveryAction = useAction(api.warehouseDeliveries.cancelDelivery);
  // @ts-ignore
  const analyzeDeliveryInvoiceAction = useAction(api.warehouseDeliveries.analyzeDeliveryInvoice);
  // @ts-ignore
  const matchDeliveryItemsAction = useAction(api.warehouseDeliveries.matchDeliveryItems);
  // @ts-ignore
  const saveItemDecisionsAction = useAction(api.warehouseDeliveries.saveItemDecisions);

  const queryKey = ["warehouseDeliveries.list", organizationId];

  const { data: deliveries = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => listDeliveriesAction({ organizationId, limit: 100 }),
    staleTime: 30_000,
  });

  const { data: productsData = [] } = useSupabaseProductsList(String(organizationId));
  const { data: locations = [] } = useSupabaseGabinetLocationsList(String(organizationId), { activeOnly: true });
  const { totalsByProductId } = useSupabaseProductStockTotals(String(organizationId));

  const stockableProducts = useMemo(
    () => productsData.filter((p) => p.isActive && p.trackStock),
    [productsData],
  );

  // Read-only view panel state (posted deliveries)
  const [viewPanelOpen, setViewPanelOpen] = useState(false);
  const [viewDelivery, setViewDelivery] = useState<{
    delivery: Record<string, unknown>;
    items: Array<Record<string, unknown>>;
    invoicePageUrls: Array<{ url: string | null; mimeType: string; position: number }>;
  } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const handleViewOpen = async (id: string) => {
    setViewLoading(true);
    try {
      const result = await getDeliveryAction({ organizationId, deliveryId: id }) as {
        delivery: Record<string, unknown>;
        items: Array<Record<string, unknown>>;
        invoicePageUrls: Array<{ url: string | null; mimeType: string; position: number }>;
      };
      setViewDelivery(result);
      setViewPanelOpen(true);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.deliveries.loadError",
          defaultValue: "Nie udało się załadować dostawy.",
        }),
      );
    } finally {
      setViewLoading(false);
    }
  };

  // Create/edit panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [editDeliveryId, setEditDeliveryId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [locationId, setLocationId] = useState(NO_LOCATION);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([newLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [editInvoicePageUrls, setEditInvoicePageUrls] = useState<Array<{ url: string | null; mimeType: string; position: number }>>([]);

  // Post delivery confirmation
  const [postTarget, setPostTarget] = useState<{ id: string; label: string } | null>(null);
  const [posting, setPosting] = useState(false);

  // Cancel delivery confirmation
  const [cancelTarget, setCancelTarget] = useState<{ id: string; label: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Invoice import dialog
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);

  // AI pipeline state (analysis + matching for the currently open draft delivery)
  const [editAnalysisStatus, setEditAnalysisStatus] = useState<string | null>(null);
  const [editAnalysisItems, setEditAnalysisItems] = useState<ParsedInvoiceItemFE[]>([]);
  const [editProposals, setEditProposals] = useState<MatchingProposalsFE | null>(null);
  const [editItemDecisions, setEditItemDecisions] = useState<ItemDecisions | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [matching, setMatching] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

  // Item decisions dialog state (can be opened from both list row and edit panel)
  const [decisionsOpen, setDecisionsOpen] = useState(false);
  const [decisionsDeliveryId, setDecisionsDeliveryId] = useState<string | null>(null);
  const [decisionsProposals, setDecisionsProposals] = useState<MatchingProposalsFE | null>(null);
  const [decisionsAnalysisItems, setDecisionsAnalysisItems] = useState<ParsedInvoiceItemFE[]>([]);
  const [decisionsSaved, setDecisionsSaved] = useState<ItemDecisions | null>(null);

  const isEditMode = editDeliveryId !== null;

  const resetPanel = useCallback(() => {
    setEditDeliveryId(null);
    setSupplierName("");
    setInvoiceNumber("");
    setDeliveryDate("");
    setLocationId(NO_LOCATION);
    setNotes("");
    setItems([newLine()]);
    setEditInvoicePageUrls([]);
    setEditAnalysisStatus(null);
    setEditAnalysisItems([]);
    setEditProposals(null);
    setEditItemDecisions(null);
  }, []);

  const handleEditOpen = async (id: string) => {
    setEditLoading(true);
    try {
      const result = await getDeliveryAction({ organizationId, deliveryId: id }) as {
        delivery: Record<string, unknown>;
        items: Array<Record<string, unknown>>;
        invoicePageUrls: Array<{ url: string | null; mimeType: string; position: number }>;
      };
      const d = result.delivery;
      setEditDeliveryId(id);
      setSupplierName(d.supplierName ? String(d.supplierName) : "");
      setInvoiceNumber(d.invoiceNumber ? String(d.invoiceNumber) : "");
      setDeliveryDate(d.deliveryDate ? String(d.deliveryDate) : "");
      setLocationId(d.locationId ? String(d.locationId) : NO_LOCATION);
      setNotes(d.notes ? String(d.notes) : "");
      setItems(
        result.items.length > 0
          ? result.items.map((item) => ({
              id: crypto.randomUUID(),
              productId: String(item.productId ?? ""),
              quantity: item.quantity != null ? String(item.quantity) : "",
              unitPrice: item.unitPrice != null ? String(item.unitPrice) : "",
              vatCode: item.vatCode ? String(item.vatCode) : "",
              unitPriceGross: item.unitPriceGross != null ? String(item.unitPriceGross) : "",
              lastEdited: item.unitPrice != null ? "net" : (item.unitPriceGross != null ? "gross" : null),
              lotNumber: item.lotNumber ? String(item.lotNumber) : "",
              expiryDate: item.expiryDate ? String(item.expiryDate) : "",
            }))
          : [newLine()],
      );
      setEditInvoicePageUrls(result.invoicePageUrls ?? []);

      // Load AI pipeline state
      const analysisStatus = d.analysisStatus ? String(d.analysisStatus) : null;
      setEditAnalysisStatus(analysisStatus);
      if (analysisStatus === "completed" && d.analysisResult && typeof d.analysisResult === "object") {
        const ar = d.analysisResult as Record<string, unknown>;
        setEditAnalysisItems(
          Array.isArray(ar.items) ? (ar.items as ParsedInvoiceItemFE[]) : [],
        );
      } else {
        setEditAnalysisItems([]);
      }
      setEditProposals(
        d.matchingProposals != null && typeof d.matchingProposals === "object"
          ? (d.matchingProposals as MatchingProposalsFE)
          : null,
      );
      setEditItemDecisions(
        d.itemDecisions != null && typeof d.itemDecisions === "object"
          ? (d.itemDecisions as ItemDecisions)
          : null,
      );

      setPanelOpen(true);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.deliveries.loadError",
          defaultValue: "Nie udało się załadować dostawy.",
        }),
      );
    } finally {
      setEditLoading(false);
    }
  };

  const handleOpenDecisions = (d: Record<string, unknown>) => {
    const proposals = d.matchingProposals as MatchingProposalsFE | null;
    if (!proposals) return;
    const ar = d.analysisResult as Record<string, unknown> | null;
    const aiItems = Array.isArray(ar?.items) ? (ar!.items as ParsedInvoiceItemFE[]) : [];
    const saved = d.itemDecisions != null && typeof d.itemDecisions === "object"
      ? (d.itemDecisions as ItemDecisions)
      : null;
    setDecisionsDeliveryId(String(d._id ?? d.id ?? ""));
    setDecisionsProposals(proposals);
    setDecisionsAnalysisItems(aiItems);
    setDecisionsSaved(saved);
    setDecisionsOpen(true);
  };

  const handleAnalyze = async () => {
    if (!editDeliveryId) return;
    setAnalyzing(true);
    try {
      const result = await analyzeDeliveryInvoiceAction({
        organizationId,
        deliveryId: editDeliveryId,
      }) as { status: "completed"; result: Record<string, unknown> } | { status: "failed"; error: string };
      if (result.status === "completed") {
        setEditAnalysisStatus("completed");
        setEditAnalysisItems(
          Array.isArray(result.result?.items) ? (result.result.items as ParsedInvoiceItemFE[]) : [],
        );
        setEditProposals(null);
        toast.success(t("gabinet.deliveries.analyzeSuccess", "Faktura przeanalizowana pomyślnie."));
      } else {
        setEditAnalysisStatus("failed");
        toast.error(result.error || t("gabinet.deliveries.analyzeFailed", "Analiza nie powiodła się."));
      }
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.deliveries.analyzeError",
          defaultValue: "Nie udało się przeanalizować faktury.",
        }),
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleMatch = async () => {
    if (!editDeliveryId) return;
    setMatching(true);
    try {
      const proposals = await matchDeliveryItemsAction({
        organizationId,
        deliveryId: editDeliveryId,
      }) as MatchingProposalsFE;
      setEditProposals(proposals);
      const matchedCount = proposals.items.filter((i) => i.status === "matched").length;
      toast.success(
        t("gabinet.deliveries.matchSuccess", "Dopasowanie zakończone. {{matched}} z {{total}} pozycji dopasowanych.", {
          matched: matchedCount,
          total: proposals.items.length,
        }),
      );
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.deliveries.matchError",
          defaultValue: "Nie udało się dopasować pozycji.",
        }),
      );
    } finally {
      setMatching(false);
    }
  };

  const addLine = () => setItems((prev) => [...prev, newLine()]);

  const removeLine = (id: string) =>
    setItems((prev) => prev.length > 1 ? prev.filter((l) => l.id !== id) : prev);

  // Smart updateLine: auto-computes the counterpart price when one price or vatCode changes.
  // lastEdited tracks which price field the user last touched, preventing feedback loops.
  const updateLine = useCallback((id: string, field: keyof LineItem, value: string) => {
    setItems((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, [field]: value };

        if (field === "unitPrice") {
          updated.lastEdited = "net";
          const net = parseNum(value);
          if (net !== null && updated.vatCode) {
            updated.unitPriceGross = grossFromNet(net, updated.vatCode);
          }
        } else if (field === "unitPriceGross") {
          updated.lastEdited = "gross";
          const gross = parseNum(value);
          if (gross !== null && updated.vatCode) {
            updated.unitPrice = netFromGross(gross, updated.vatCode);
          }
        } else if (field === "vatCode") {
          if (updated.lastEdited === "net") {
            const net = parseNum(updated.unitPrice);
            if (net !== null && value) {
              updated.unitPriceGross = grossFromNet(net, value);
            }
          } else if (updated.lastEdited === "gross") {
            const gross = parseNum(updated.unitPriceGross);
            if (gross !== null && value) {
              updated.unitPrice = netFromGross(gross, value);
            }
          }
        }

        return updated;
      }),
    );
  }, []);

  const validItems = useMemo(
    () => items.filter((l) => l.productId && (parseNum(l.quantity) ?? 0) > 0),
    [items],
  );

  const totals = useMemo(() => {
    let net = 0, gross = 0;
    let hasNet = false, hasGross = false;
    for (const l of validItems) {
      const qty = parseNum(l.quantity);
      const netP = parseNum(l.unitPrice);
      const grossP = parseNum(l.unitPriceGross);
      if (qty !== null && netP !== null) { net += qty * netP; hasNet = true; }
      if (qty !== null && grossP !== null) { gross += qty * grossP; hasGross = true; }
    }
    if (!hasNet && !hasGross) return null;
    return { net: hasNet ? round2(net) : null, gross: hasGross ? round2(gross) : null };
  }, [validItems]);

  const canSubmit = validItems.length > 0 && !submitting;

  const handleSave = async () => {
    if (!canSubmit) return;

    // Detect duplicate LOT within this delivery before submitting
    const lotSeen = new Set<string>();
    for (const l of validItems) {
      if (l.lotNumber.trim()) {
        const key = `${l.productId}::${l.lotNumber.trim()}`;
        if (lotSeen.has(key)) {
          toast.error(
            t("gabinet.deliveries.duplicateLot", {
              lot: l.lotNumber.trim(),
              defaultValue: `Numer LOT "${l.lotNumber.trim()}" powtarza się dla tego samego produktu w tej dostawie.`,
            }),
          );
          return;
        }
        lotSeen.add(key);
      }
    }

    setSubmitting(true);
    try {
      const resolvedLocation =
        locationId !== NO_LOCATION ? (locationId as Id<"gabinetLocations">) : undefined;
      const itemsPayload = validItems.map((l) => {
        const qty = parseNum(l.quantity)!;
        const netP = parseNum(l.unitPrice) ?? undefined;
        const grossP = parseNum(l.unitPriceGross) ?? undefined;
        const vRate = l.vatCode ? vatRate(l.vatCode) : undefined;
        return {
          productId: l.productId,
          quantity: qty,
          unitPrice: netP,
          vatRate: vRate,
          vatCode: l.vatCode || undefined,
          unitPriceGross: grossP,
          lineValueNet: netP !== undefined ? round2(qty * netP) : undefined,
          lineValueGross: grossP !== undefined ? round2(qty * grossP) : undefined,
          lotNumber: l.lotNumber.trim() || undefined,
          expiryDate: l.expiryDate.trim() || undefined,
        };
      });

      if (isEditMode) {
        await updateDeliveryAction({
          organizationId,
          deliveryId: editDeliveryId!,
          supplierName: supplierName.trim() || undefined,
          invoiceNumber: invoiceNumber.trim() || undefined,
          deliveryDate: deliveryDate || undefined,
          locationId: resolvedLocation,
          notes: notes.trim() || undefined,
          items: itemsPayload,
        });
        toast.success(t("gabinet.deliveries.updateSuccess", "Dostawa zaktualizowana."));
      } else {
        await createDeliveryAction({
          organizationId,
          supplierName: supplierName.trim() || undefined,
          invoiceNumber: invoiceNumber.trim() || undefined,
          deliveryDate: deliveryDate || undefined,
          locationId: resolvedLocation,
          notes: notes.trim() || undefined,
          items: itemsPayload,
        });
        toast.success(t("gabinet.deliveries.createSuccess", "Dostawa utworzona."));
      }
      void queryClient.invalidateQueries({ queryKey });
      setPanelOpen(false);
      resetPanel();
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: isEditMode ? "gabinet.deliveries.updateError" : "gabinet.deliveries.createError",
          defaultValue: isEditMode
            ? "Nie udało się zaktualizować dostawy."
            : "Nie udało się utworzyć dostawy.",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostConfirm = async () => {
    if (!postTarget) return;
    setPosting(true);
    try {
      await postDeliveryAction({ organizationId, deliveryId: postTarget.id });
      toast.success(t("gabinet.deliveries.postSuccess", "Dostawa zaksięgowana. Stany magazynowe zaktualizowane."));
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["supabase", "productStockLevels"] });
      void queryClient.invalidateQueries({ queryKey: ["supabase", "productStockMovements"] });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.deliveries.postError",
          defaultValue: "Nie udało się zaksięgować dostawy.",
        }),
      );
    } finally {
      setPosting(false);
      setPostTarget(null);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const result = await cancelDeliveryAction({ organizationId, deliveryId: cancelTarget.id });
      toast.success(t("gabinet.deliveries.cancelSuccess", "Dostawa usunięta."));
      if (result?.warnings?.length) {
        for (const w of result.warnings) {
          toast.warning(w);
        }
      }
      void queryClient.invalidateQueries({ queryKey });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.deliveries.cancelError",
          defaultValue: "Nie udało się usunąć dostawy.",
        }),
      );
    } finally {
      setCancelling(false);
      setCancelTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("gabinet.deliveries.title", "Dostawy")}
        description={t(
          "gabinet.deliveries.description",
          "Dokumenty przyjęcia towaru do magazynu. Zaksięgowanie dostawy automatycznie aktualizuje stany magazynowe.",
        )}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setInvoiceDialogOpen(true)}>
              <FileText className="mr-2 h-4 w-4" variant="stroke" />
              {t("gabinet.deliveries.fromInvoice", "Z faktury")}
            </Button>
            <Button onClick={() => setPanelOpen(true)}>
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              {t("gabinet.deliveries.newDelivery", "Nowa dostawa")}
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" variant="stroke" />
          {t("common.loading", "Ładowanie…")}
        </div>
      ) : deliveries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <TruckIcon className="h-8 w-8 text-muted-foreground/50" variant="stroke" />
          <p className="text-sm font-medium text-muted-foreground">
            {t("gabinet.deliveries.empty", "Brak dostaw")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("gabinet.deliveries.emptyHint", "Utwórz pierwszą dostawę klikając przycisk powyżej.")}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("gabinet.deliveries.col.date", "Data")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("gabinet.deliveries.col.supplier", "Dostawca")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("gabinet.deliveries.col.invoice", "Nr faktury")}
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  {t("gabinet.deliveries.col.totalValueGross", "Wartość brutto")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("gabinet.deliveries.col.status", "Status")}
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  {t("gabinet.deliveries.col.actions", "Akcje")}
                </th>
              </tr>
            </thead>
            <tbody>
              {(deliveries as Array<Record<string, unknown>>).map((d) => {
                const id = String(d._id ?? d.id ?? "");
                const status = String(d.status ?? "draft");
                const supplier = d.supplierName ? String(d.supplierName) : null;
                const invoice = d.invoiceNumber ? String(d.invoiceNumber) : null;
                const createdAt = typeof d.createdAt === "number" ? d.createdAt : null;
                const delivDate = d.deliveryDate ? String(d.deliveryDate) : null;
                const label = invoice ?? supplier ?? id.slice(0, 8);
                const displayValue =
                  typeof d.totalValueGross === "number"
                    ? d.totalValueGross
                    : typeof d.totalValue === "number"
                      ? d.totalValue
                      : null;
                return (
                  <tr key={id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">
                      {delivDate ?? formatDate(createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {supplier ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {invoice ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {displayValue !== null
                        ? fmtMoney(displayValue)
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {statusBadge(status, t)}
                        {Array.isArray(d.invoicePages) && (d.invoicePages as unknown[]).length > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400">
                            <FileText className="h-3.5 w-3.5 shrink-0" variant="stroke" />
                            {t("gabinet.deliveries.invoiceBadge", "Faktura")}
                            {" · "}{(d.invoicePages as unknown[]).length}&nbsp;{t("gabinet.deliveries.invoiceBadgePages", "str.")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {status === "draft" ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditOpen(id)}
                            disabled={editLoading}
                            className="gap-1.5"
                          >
                            {t("gabinet.deliveries.editAction", "Edytuj")}
                          </Button>
                          {d.matchingProposals != null && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenDecisions(d)}
                              className="gap-1.5"
                            >
                              <Sparkles className="h-3.5 w-3.5" variant="stroke" />
                              {t("gabinet.deliveries.checkItemsAction", "Sprawdź pozycje")}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPostTarget({ id, label })}
                            className="gap-1.5"
                          >
                            <CheckCircle className="h-3.5 w-3.5" variant="stroke" />
                            {t("gabinet.deliveries.postAction", "Zaksięguj")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCancelTarget({ id, label })}
                            className="gap-1.5 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" variant="stroke" />
                            {t("gabinet.deliveries.cancelAction", "Usuń")}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewOpen(id)}
                          disabled={viewLoading}
                          className="gap-1.5"
                        >
                          {t("gabinet.deliveries.viewAction", "Podgląd")}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create delivery panel */}
      <SidePanel
        open={panelOpen}
        onOpenChange={(o) => {
          setPanelOpen(o);
          if (!o) resetPanel();
        }}
        title={
          isEditMode
            ? t("gabinet.deliveries.editDelivery", "Edytuj dostawę")
            : t("gabinet.deliveries.newDelivery", "Nowa dostawa")
        }
        description={t(
          "gabinet.deliveries.newDeliveryDesc",
          "Wypełnij dane dostawy. Po zapisaniu możesz ją zaksięgować, co zaktualizuje stany magazynowe.",
        )}
      >
        <div className="space-y-5">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="delivery-supplier">
                {t("gabinet.deliveries.supplierName", "Dostawca")}
              </Label>
              <Input
                id="delivery-supplier"
                placeholder={t("gabinet.deliveries.supplierPlaceholder", "Nazwa firmy…")}
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delivery-invoice">
                {t("gabinet.deliveries.invoiceNumber", "Nr faktury")}
              </Label>
              <Input
                id="delivery-invoice"
                placeholder="FV/2024/001"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="delivery-date">
                {t("gabinet.deliveries.deliveryDate", "Data dostawy")}
              </Label>
              <Input
                id="delivery-date"
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
            {locations.length > 0 && (
              <div className="space-y-1.5">
                <Label>
                  {t("gabinet.deliveries.location", "Lokalizacja")}
                </Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_LOCATION}>
                      {t("gabinet.deliveries.noLocation", "Bez lokalizacji")}
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

          <div className="space-y-1.5">
            <Label htmlFor="delivery-notes">
              {t("gabinet.deliveries.notes", "Uwagi (opcjonalnie)")}
            </Label>
            <Textarea
              id="delivery-notes"
              rows={2}
              placeholder={t("gabinet.deliveries.notesPlaceholder", "Dodatkowe informacje o dostawie…")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("gabinet.deliveries.items", "Pozycje dostawy")}</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addLine} className="h-7 gap-1 px-2 text-xs">
                <Plus className="h-3.5 w-3.5" variant="stroke" />
                {t("gabinet.deliveries.addLine", "Dodaj pozycję")}
              </Button>
            </div>

            <div className="rounded-md border">
              {/* column headers */}
              <div className="grid grid-cols-[1fr_65px_85px_82px_82px_28px] gap-1 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>{t("gabinet.deliveries.colProduct", "Produkt")}</span>
                <span className="text-right">{t("gabinet.deliveries.colQty", "Ilość")}</span>
                <span className="text-right">{t("gabinet.deliveries.colUnitPriceNet", "Cena netto")}</span>
                <span className="text-center">{t("gabinet.deliveries.colVat", "VAT")}</span>
                <span className="text-right">{t("gabinet.deliveries.colUnitPriceGross", "Cena brutto")}</span>
                <span />
              </div>
              <div className="divide-y">
                {items.map((line) => (
                  <div key={line.id} className="px-3 py-2 space-y-1.5">
                    {/* Row 1: product + qty + prices + delete */}
                    <div className="grid grid-cols-[1fr_65px_85px_82px_82px_28px] items-center gap-1">
                      <Select
                        value={line.productId}
                        onValueChange={(v) => updateLine(line.id, "productId", v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder={t("gabinet.deliveries.selectProduct", "Wybierz…")} />
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

                      <Input
                        className="h-8 text-right text-xs tabular-nums"
                        placeholder="0"
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v))
                            updateLine(line.id, "quantity", v);
                        }}
                      />

                      <Input
                        className="h-8 text-right text-xs tabular-nums"
                        placeholder="—"
                        inputMode="decimal"
                        value={line.unitPrice}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v))
                            updateLine(line.id, "unitPrice", v);
                        }}
                      />

                      <Select
                        value={line.vatCode}
                        onValueChange={(v) => updateLine(line.id, "vatCode", v as VatCode)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="VAT" />
                        </SelectTrigger>
                        <SelectContent>
                          {VAT_OPTIONS.map((o) => (
                            <SelectItem key={o.code} value={o.code}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Input
                        className="h-8 text-right text-xs tabular-nums"
                        placeholder="—"
                        inputMode="decimal"
                        value={line.unitPriceGross}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v))
                            updateLine(line.id, "unitPriceGross", v);
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        disabled={items.length === 1}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors",
                          items.length > 1 ? "hover:bg-destructive/10 hover:text-destructive" : "opacity-30 cursor-default",
                        )}
                      >
                        <Trash2 className="h-3.5 w-3.5" variant="stroke" />
                      </button>
                    </div>

                    {/* Stock-before-delivery hint */}
                    {line.productId && (() => {
                      const stockEntry = totalsByProductId.get(line.productId);
                      if (!stockEntry) return null;
                      const product = stockableProducts.find((p) => p._id === line.productId);
                      const unit = product?.stockUnit ?? "szt.";
                      return (
                        <p className="text-xs text-muted-foreground px-0.5">
                          {t("gabinet.deliveries.stockBefore", "Stan przed dostawą")}: {stockEntry.total.toLocaleString("pl-PL")} {unit}
                        </p>
                      );
                    })()}

                    {/* Row 2: LOT number + expiry date (optional) */}
                    <div className="grid grid-cols-2 gap-1">
                      <Input
                        className="h-7 text-xs"
                        placeholder={t("gabinet.deliveries.lotNumber", "Nr LOT (opcjonalnie)")}
                        value={line.lotNumber}
                        onChange={(e) => updateLine(line.id, "lotNumber", e.target.value)}
                      />
                      <Input
                        className="h-7 text-xs"
                        type="date"
                        title={t("gabinet.deliveries.expiryDate", "Termin ważności")}
                        value={line.expiryDate}
                        onChange={(e) => updateLine(line.id, "expiryDate", e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Delivery totals summary */}
              {totals !== null && (
                <div className="border-t bg-muted/20 px-3 py-2.5 space-y-1">
                  {totals.net !== null && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{t("gabinet.deliveries.totalNet", "Suma netto")}</span>
                      <span className="tabular-nums font-medium">{fmtMoney(totals.net)}</span>
                    </div>
                  )}
                  {totals.net !== null && totals.gross !== null && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{t("gabinet.deliveries.totalVat", "VAT")}</span>
                      <span className="tabular-nums font-medium">{fmtMoney(round2(totals.gross - totals.net))}</span>
                    </div>
                  )}
                  {totals.gross !== null && (
                    <div className="flex justify-between text-xs font-semibold">
                      <span>{t("gabinet.deliveries.totalGross", "Suma brutto")}</span>
                      <span className="tabular-nums">{fmtMoney(totals.gross)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {stockableProducts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {t(
                  "gabinet.deliveries.noStockableProducts",
                  "Brak produktów ze śledzeniem stanów magazynowych. Włącz śledzenie w ustawieniach produktu.",
                )}
              </p>
            )}
          </div>

          {editInvoicePageUrls.length > 0 && (
            <div className="space-y-2 text-sm">
              <p className="text-xs font-medium text-muted-foreground">
                {t("gabinet.deliveries.sourceDocument", "Dokument źródłowy")}
              </p>
              <InvoicePageViewer pages={editInvoicePageUrls} t={t} />
            </div>
          )}

          {/* AI import pipeline — visible for draft deliveries with uploaded invoice pages */}
          {isEditMode && editInvoicePageUrls.length > 0 && (
            <div className="rounded-md border bg-muted/20 p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("gabinet.deliveries.aiImport.title", "Import z faktury (AI)")}
              </p>

              {/* Step 1 — OCR analysis */}
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold leading-none",
                  editAnalysisStatus === "completed"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground",
                )}>
                  {editAnalysisStatus === "completed" ? "✓" : "1"}
                </div>
                <div className="flex flex-1 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium">
                      {t("gabinet.deliveries.aiImport.analyzeStep", "Odczyt faktury (OCR)")}
                    </p>
                    {editAnalysisStatus === "completed" && (
                      <p className="text-xs text-muted-foreground">
                        {t("gabinet.deliveries.aiImport.analyzeResult", "{{count}} pozycji odczytanych", { count: editAnalysisItems.length })}
                      </p>
                    )}
                    {editAnalysisStatus === "failed" && (
                      <p className="text-xs text-destructive">
                        {t("gabinet.deliveries.aiImport.analyzeFailed", "Analiza nie powiodła się")}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs shrink-0"
                    disabled={analyzing || matching}
                    onClick={handleAnalyze}
                  >
                    {analyzing
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" variant="stroke" />
                      : <Sparkles className="mr-1.5 h-3.5 w-3.5" variant="stroke" />
                    }
                    {editAnalysisStatus === "completed"
                      ? t("gabinet.deliveries.aiImport.reanalyze", "Ponów")
                      : t("gabinet.deliveries.aiImport.analyze", "Analizuj")}
                  </Button>
                </div>
              </div>

              {/* Step 2 — product matching */}
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold leading-none",
                  editProposals != null
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground",
                  editAnalysisStatus !== "completed" ? "opacity-40" : "",
                )}>
                  {editProposals != null ? "✓" : "2"}
                </div>
                <div className="flex flex-1 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className={cn("text-xs font-medium", editAnalysisStatus !== "completed" ? "opacity-50" : "")}>
                      {t("gabinet.deliveries.aiImport.matchStep", "Dopasowanie produktów")}
                    </p>
                    {editProposals != null && (
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "gabinet.deliveries.aiImport.matchResult",
                          "{{matched}} / {{total}} dopasowanych",
                          {
                            matched: editProposals.items.filter((i) => i.status === "matched").length,
                            total: editProposals.items.length,
                          },
                        )}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs shrink-0"
                    disabled={matching || analyzing || editAnalysisStatus !== "completed"}
                    onClick={handleMatch}
                  >
                    {matching
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" variant="stroke" />
                      : <RefreshCw className="mr-1.5 h-3.5 w-3.5" variant="stroke" />
                    }
                    {editProposals != null
                      ? t("gabinet.deliveries.aiImport.rematch", "Ponów")
                      : t("gabinet.deliveries.aiImport.match", "Dopasuj")}
                  </Button>
                </div>
              </div>

              {/* Step 3 — review & decide */}
              {editProposals != null && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 text-xs flex-1"
                    onClick={() => setVerifyOpen(true)}
                  >
                    <CheckCircle className="mr-1.5 h-3.5 w-3.5" variant="stroke" />
                    {t("gabinet.deliveries.aiImport.review", "Importuj pozycje")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs flex-1"
                    onClick={() => {
                      setDecisionsDeliveryId(editDeliveryId);
                      setDecisionsProposals(editProposals);
                      setDecisionsAnalysisItems(editAnalysisItems);
                      setDecisionsSaved(editItemDecisions);
                      setDecisionsOpen(true);
                    }}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" variant="stroke" />
                    {t("gabinet.deliveries.aiImport.checkItems", "Sprawdź pozycje")}
                  </Button>
                </div>
              )}
            </div>
          )}

          <Button
            className="w-full"
            disabled={!canSubmit}
            onClick={handleSave}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" variant="stroke" />}
            {isEditMode
              ? t("gabinet.deliveries.saveChanges", "Zapisz zmiany")
              : t("gabinet.deliveries.saveDelivery", "Zapisz dostawę")}
          </Button>
        </div>
      </SidePanel>

      {/* Read-only view panel for posted deliveries */}
      <SidePanel
        open={viewPanelOpen}
        onOpenChange={(o) => {
          setViewPanelOpen(o);
          if (!o) setViewDelivery(null);
        }}
        title={t("gabinet.deliveries.viewDelivery", "Podgląd dostawy")}
        description={t("gabinet.deliveries.viewDeliveryDesc", "Szczegóły zaksięgowanej dostawy (tylko do odczytu).")}
      >
        {viewDelivery && (() => {
          const d = viewDelivery.delivery;
          const viewItems = viewDelivery.items;
          const supplier = d.supplierName ? String(d.supplierName) : null;
          const invoice = d.invoiceNumber ? String(d.invoiceNumber) : null;
          const delivDate = d.deliveryDate ? String(d.deliveryDate) : null;
          const viewNotes = d.notes ? String(d.notes) : null;
          const viewGross = typeof d.totalValueGross === "number" ? d.totalValueGross : null;
          const viewNet = typeof d.totalValue === "number" ? d.totalValue : null;
          const locationLabel = locations.find(
            (loc) => loc._id === String(d.locationId ?? "")
          )?.name ?? null;

          return (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {supplier && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">{t("gabinet.deliveries.supplierName", "Dostawca")}</p>
                    <p className="font-medium">{supplier}</p>
                  </div>
                )}
                {invoice && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">{t("gabinet.deliveries.invoiceNumber", "Nr faktury")}</p>
                    <p className="font-medium">{invoice}</p>
                  </div>
                )}
                {delivDate && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">{t("gabinet.deliveries.deliveryDate", "Data dostawy")}</p>
                    <p className="font-medium">{delivDate}</p>
                  </div>
                )}
                {locationLabel && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">{t("gabinet.deliveries.location", "Lokalizacja")}</p>
                    <p className="font-medium">{locationLabel}</p>
                  </div>
                )}
              </div>

              {viewNotes && (
                <div className="space-y-0.5 text-sm">
                  <p className="text-xs text-muted-foreground">{t("gabinet.deliveries.notes", "Uwagi")}</p>
                  <p className="whitespace-pre-line">{viewNotes}</p>
                </div>
              )}

              {viewDelivery.invoicePageUrls.length > 0 && (
                <div className="space-y-2 text-sm">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("gabinet.deliveries.sourceDocument", "Dokument źródłowy")}
                  </p>
                  <InvoicePageViewer pages={viewDelivery.invoicePageUrls} t={t} />
                </div>
              )}

              <div className="rounded-md border">
                <div className="grid grid-cols-[1fr_55px_70px] gap-1 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>{t("gabinet.deliveries.colProduct", "Produkt")}</span>
                  <span className="text-right">{t("gabinet.deliveries.colQty", "Ilość")}</span>
                  <span className="text-right">{t("gabinet.deliveries.colUnitPriceGross", "Cena brutto")}</span>
                </div>
                <div className="divide-y">
                  {viewItems.map((item, idx) => {
                    const product = stockableProducts.find(
                      (p) => p._id === String(item.productId ?? ""),
                    );
                    const lotNumber = item.lotNumber ? String(item.lotNumber) : null;
                    const expiryDate = item.expiryDate ? String(item.expiryDate) : null;
                    return (
                      <div key={idx} className="px-3 py-2 space-y-0.5">
                        <div className="grid grid-cols-[1fr_55px_70px] gap-1 items-start text-sm">
                          <span className="font-medium">
                            {product?.name ?? String(item.productId ?? "")}
                            {product?.sku ? <span className="ml-1 text-xs text-muted-foreground">({product.sku})</span> : null}
                          </span>
                          <span className="text-right tabular-nums">
                            {item.quantity != null ? String(item.quantity) : "—"}
                          </span>
                          <span className="text-right tabular-nums">
                            {item.unitPriceGross != null
                              ? fmtMoney(Number(item.unitPriceGross))
                              : item.unitPrice != null
                                ? fmtMoney(Number(item.unitPrice))
                                : "—"}
                          </span>
                        </div>
                        {(lotNumber || expiryDate) && (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            {lotNumber && <span>LOT: <span className="font-medium text-foreground">{lotNumber}</span></span>}
                            {expiryDate && (() => {
                              const expiryStatus = getExpiryStatus(expiryDate);
                              const dateClass =
                                expiryStatus === "expired"
                                  ? "font-medium text-destructive"
                                  : expiryStatus === "expiring_soon"
                                    ? "font-medium text-amber-600 dark:text-amber-400"
                                    : "font-medium text-foreground";
                              return (
                                <span className="flex flex-wrap items-center gap-1">
                                  <span>{t("gabinet.deliveries.expiryDate", "Termin ważności")}:</span>
                                  <span className={dateClass}>{expiryDate}</span>
                                  {expiryStatus === "expired" && (
                                    <Badge variant="destructive" className="text-xs px-1.5 py-0 h-4">
                                      {t("products.stock.lots.expired", "Po terminie")}
                                    </Badge>
                                  )}
                                  {expiryStatus === "expiring_soon" && (
                                    <Badge className="text-xs px-1.5 py-0 h-4 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                                      {t("products.stock.lots.expiringSoon", "Ważność do 30 dni")}
                                    </Badge>
                                  )}
                                </span>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {(viewNet !== null || viewGross !== null) && (
                  <div className="border-t bg-muted/20 px-3 py-2.5 space-y-1">
                    {viewNet !== null && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{t("gabinet.deliveries.totalNet", "Suma netto")}</span>
                        <span className="tabular-nums font-medium">{fmtMoney(viewNet)}</span>
                      </div>
                    )}
                    {viewGross !== null && (
                      <div className="flex justify-between text-xs font-semibold">
                        <span>{t("gabinet.deliveries.totalGross", "Suma brutto")}</span>
                        <span className="tabular-nums">{fmtMoney(viewGross)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </SidePanel>

      {/* Post delivery confirmation */}
      <AlertDialog
        open={!!postTarget}
        onOpenChange={(o) => { if (!o) setPostTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("gabinet.deliveries.postTitle", "Zaksięgować dostawę?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "gabinet.deliveries.postDescription",
                "Zaksięgowanie jest nieodwracalne. Dla każdej pozycji zostanie utworzony ruch magazynowy i zaktualizowany stan produktu.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={posting}>
              {t("common.cancel", "Anuluj")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handlePostConfirm} disabled={posting}>
              {posting && <Loader2 className="mr-2 h-4 w-4 animate-spin" variant="stroke" />}
              {t("gabinet.deliveries.postConfirm", "Zaksięguj")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel delivery confirmation */}
      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(o) => { if (!o) setCancelTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("gabinet.deliveries.cancelTitle", "Usunąć roboczą dostawę?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "gabinet.deliveries.cancelDescription",
                "Dostawa zostanie trwale usunięta. Nie ma to wpływu na stany magazynowe, ponieważ dostawa nie została jeszcze zaksięgowana.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>
              {t("common.back", "Wróć")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" variant="stroke" />}
              {t("gabinet.deliveries.cancelConfirm", "Usuń dostawę")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invoice import dialog */}
      <InvoiceImportDialog
        organizationId={organizationId}
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
        onSaved={() => void queryClient.invalidateQueries({ queryKey })}
      />

      {/* Matching proposals verification dialog */}
      {editProposals != null && (
        <VerifyMatchesDialog
          open={verifyOpen}
          onOpenChange={setVerifyOpen}
          proposals={editProposals}
          analysisItems={editAnalysisItems}
          products={stockableProducts}
          onApply={(newItems) => {
            setItems(newItems.length > 0 ? newItems : [newLine()]);
          }}
        />
      )}

      {/* Item decisions dialog (#3055) */}
      {decisionsProposals != null && decisionsDeliveryId != null && (
        <ItemDecisionsDialog
          open={decisionsOpen}
          onOpenChange={setDecisionsOpen}
          deliveryId={decisionsDeliveryId}
          organizationId={organizationId}
          proposals={decisionsProposals}
          analysisItems={decisionsAnalysisItems}
          savedDecisions={decisionsSaved}
          products={stockableProducts}
          onSave={(saved) => {
            setDecisionsSaved(saved);
            if (editDeliveryId === decisionsDeliveryId) {
              setEditItemDecisions(saved);
            }
            void queryClient.invalidateQueries({ queryKey });
          }}
          saveAction={saveItemDecisionsAction as (args: { organizationId: typeof organizationId; deliveryId: string; decisions: unknown }) => Promise<void>}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoice import dialog (#3016)
// ---------------------------------------------------------------------------

interface InvoicePage {
  id: string;
  file: File;
  preview: string;  // blob URL for images, empty string for PDFs
  storageId: string | null;
  uploading: boolean;
  error: boolean;
}

function InvoiceImportDialog({
  organizationId,
  open,
  onOpenChange,
  onSaved,
}: {
  organizationId: Id<"organizations">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const generateUploadUrl = useMutation(api.app.generateUploadUrl);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen
  const createFromInvoice = useAction(api.warehouseDeliveries.createDeliveryFromInvoice);

  const [pages, setPages] = useState<InvoicePage[]>([]);
  const [saving, setSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cleanup = useCallback(() => {
    setPages((prev) => {
      prev.forEach((p) => { if (p.preview) URL.revokeObjectURL(p.preview); });
      return [];
    });
  }, []);

  const handleOpenChange = (o: boolean) => {
    if (!o && !saving) cleanup();
    onOpenChange(o);
  };

  const uploadPage = useCallback(
    async (pageId: string, file: File) => {
      try {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!res.ok) throw new Error("Upload failed");
        const { storageId } = await res.json() as { storageId: string };
        setPages((prev) =>
          prev.map((p) => p.id === pageId ? { ...p, storageId, uploading: false } : p),
        );
      } catch {
        setPages((prev) =>
          prev.map((p) => p.id === pageId ? { ...p, uploading: false, error: true } : p),
        );
      }
    },
    [generateUploadUrl],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const valid = files.filter(
        (f) => f.type === "application/pdf" || f.type.startsWith("image/"),
      );
      if (valid.length === 0) return;

      const newPages: InvoicePage[] = valid.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
        storageId: null,
        uploading: true,
        error: false,
      }));

      setPages((prev) => [...prev, ...newPages]);
      newPages.forEach((p) => void uploadPage(p.id, p.file));
    },
    [uploadPage],
  );

  const removePage = (id: string) => {
    setPages((prev) => {
      const page = prev.find((p) => p.id === id);
      if (page?.preview) URL.revokeObjectURL(page.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const moveUp = (id: string) => {
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveDown = (id: string) => {
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const handleSave = async () => {
    const readyPages = pages.filter((p) => p.storageId && !p.error);
    if (readyPages.length === 0) return;

    setSaving(true);
    try {
      await createFromInvoice({
        organizationId,
        pages: readyPages.map((p, idx) => ({
          storageId: p.storageId!,
          mimeType: p.file.type || "application/octet-stream",
          position: idx,
        })),
      });
      toast.success(
        t("gabinet.deliveries.invoiceImport.created", "Robocza dostawa z faktury utworzona."),
      );
      onSaved();
      onOpenChange(false);
      cleanup();
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.deliveries.invoiceImport.error",
          defaultValue: "Nie udało się utworzyć dostawy.",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const isUploading = pages.some((p) => p.uploading);
  const hasErrors = pages.some((p) => p.error);
  const readyCount = pages.filter((p) => p.storageId && !p.error).length;
  const canSave = readyCount > 0 && !isUploading && !saving;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("gabinet.deliveries.invoiceImport.title", "Dodaj dostawę z faktury")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "gabinet.deliveries.invoiceImport.description",
              "Dodaj plik PDF lub zdjęcia faktury (kolejne strony). Po zapisaniu zostanie utworzona robocza dostawa powiązana z tym dokumentem.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Uploaded pages list */}
          {pages.length > 0 && (
            <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-md border p-2">
              {pages.map((page, idx) => (
                <div
                  key={page.id}
                  className="flex items-center gap-2 rounded-md border bg-muted/30 p-2"
                >
                  {/* Thumbnail or PDF icon */}
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded">
                    {page.preview ? (
                      <img src={page.preview} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted">
                        <FileText className="h-5 w-5 text-muted-foreground" variant="stroke" />
                      </div>
                    )}
                  </div>

                  {/* Filename and upload status */}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-xs font-medium">{page.file.name}</p>
                    {page.uploading && (
                      <p className="flex items-center text-xs text-muted-foreground">
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" variant="stroke" />
                        {t("common.uploading", "Przesyłanie…")}
                      </p>
                    )}
                    {page.error && (
                      <p className="text-xs text-destructive">
                        {t("gabinet.deliveries.invoiceImport.uploadError", "Błąd przesyłania")}
                      </p>
                    )}
                  </div>

                  {/* Page number */}
                  <span className="w-5 text-center text-xs text-muted-foreground">
                    {idx + 1}
                  </span>

                  {/* Reorder buttons */}
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveUp(page.id)}
                      disabled={idx === 0}
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors",
                        idx > 0
                          ? "hover:bg-muted hover:text-foreground"
                          : "cursor-default opacity-30",
                      )}
                      aria-label={t("gabinet.deliveries.invoiceImport.moveUp", "Przesuń wyżej")}
                    >
                      <ChevronUp className="h-3.5 w-3.5" variant="stroke" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDown(page.id)}
                      disabled={idx === pages.length - 1}
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors",
                        idx < pages.length - 1
                          ? "hover:bg-muted hover:text-foreground"
                          : "cursor-default opacity-30",
                      )}
                      aria-label={t("gabinet.deliveries.invoiceImport.moveDown", "Przesuń niżej")}
                    >
                      <ChevronDown className="h-3.5 w-3.5" variant="stroke" />
                    </button>
                  </div>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => removePage(page.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label={t("common.delete", "Usuń")}
                  >
                    <Trash2 className="h-3.5 w-3.5" variant="stroke" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Drop zone / add more files */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
            }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
              if (e.dataTransfer.files?.length) {
                addFiles(Array.from(e.dataTransfer.files));
              }
            }}
            data-dragging={isDragging || undefined}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50 data-[dragging=true]:border-primary/50 data-[dragging=true]:bg-accent/50"
          >
            <Plus className="h-5 w-5" variant="stroke" />
            <p>
              {pages.length === 0
                ? t(
                    "gabinet.deliveries.invoiceImport.dropHint",
                    "Kliknij lub przeciągnij plik PDF lub zdjęcia faktury",
                  )
                : t("gabinet.deliveries.invoiceImport.addMore", "Dodaj kolejne strony")}
            </p>
            <p className="text-xs">
              {t("gabinet.deliveries.invoiceImport.formats", "PDF, JPG, PNG, HEIC i inne formaty zdjęć")}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  addFiles(Array.from(e.target.files));
                  e.target.value = "";
                }
              }}
            />
          </div>

          {hasErrors && (
            <p className="text-xs text-destructive">
              {t(
                "gabinet.deliveries.invoiceImport.hasErrors",
                "Niektóre pliki nie zostały przesłane poprawnie. Usuń je i spróbuj ponownie.",
              )}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            {t("common.cancel", "Anuluj")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" variant="stroke" />}
            {t("gabinet.deliveries.invoiceImport.save", "Utwórz dostawę")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// VerifyMatchesDialog (#3052)
// ---------------------------------------------------------------------------
// Shows each item from matchingProposals, lets user confirm/override the
// product assignment or skip the item, then inserts the accepted items into
// the delivery line-items form.

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

function VerifyMatchesDialog({
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
    proposals.items.forEach((item, idx) => {
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

// ---------------------------------------------------------------------------
// ItemDecisionsDialog (#3055)
// ---------------------------------------------------------------------------
// Verification screen for saving per-item decisions separately from
// analysisResult and matchingProposals.

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

function ItemDecisionsDialog({
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
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

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

        <DialogFooter className="border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel", "Anuluj")}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || unresolvedIndices.length > 0}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" variant="stroke" />}
            {t("gabinet.deliveries.decisions.save", "Zapisz decyzje")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
