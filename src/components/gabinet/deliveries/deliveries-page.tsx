import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { getExpiryStatus } from "@/lib/expiry-utils";
import { useAction } from "convex/react";
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
import { Plus, Trash2, TruckIcon, Loader2, CheckCircle, FileText, Sparkles, RefreshCw, AlertCircle, X } from "@/lib/ez-icons";
import { formatActionError } from "@/lib/format-action-error";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSupabaseProductsList, useSupabaseProductStockTotals } from "@/hooks/use-supabase-products";
import { useSupabaseGabinetLocationsList } from "@/hooks/use-supabase-gabinet-locations";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import { useActiveLocation } from "@/contexts/gabinet-location-context";
import { Skeleton } from "@/components/ui/skeleton";
import {
  NO_LOCATION,
  VAT_OPTIONS,
  vatRate,
  round2,
  grossFromNet,
  netFromGross,
  newLine,
  parseNum,
  statusBadge,
  formatDate,
  fmtMoney,
} from "./types";
import type {
  LineItem,
  ParsedInvoiceItemFE,
  MatchingProposalsFE,
  ItemDecisions,
  PostDeliveryResult,
  VatCode,
} from "./types";
import { InvoicePageViewer } from "./invoice-page-viewer";
import { InvoiceImportDialog } from "./invoice-import-dialog";
import { VerifyMatchesDialog } from "./verify-matches-dialog";
import { ItemDecisionsDialog } from "./item-decisions-dialog";
import { DeliveryChoiceDialog } from "./delivery-choice-dialog";

export function DeliveriesPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export function DeliveriesPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const routeNavigate = useNavigate();
  const { action: actionParam } = useSearch({ from: "/_app/_auth/dashboard/_layout/gabinet/deliveries" });
  const { allowed: canCreate } = usePermission("gabinet_inventory", "create");
  const { allowed: canEdit } = usePermission("gabinet_inventory", "edit");
  const { allowed: canDelete } = usePermission("gabinet_inventory", "delete");

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
  // @ts-ignore
  const postDeliveryFromDecisionsAction = useAction(api.warehouseDeliveries.postDeliveryFromDecisions);

  const queryKey = ["warehouseDeliveries.list", organizationId];

  const { data: deliveries = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => listDeliveriesAction({ organizationId, limit: 100 }),
    staleTime: 30_000,
  });

  const { activeLocationId, setActiveLocationId } = useActiveLocation();

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

  // ?action=create navigates here from the sidebar quick-action and auto-opens
  // the new-delivery panel (issue #3153). Clear the param after consuming so a
  // refresh doesn't reopen it.
  useEffect(() => {
    if (actionParam === "create") {
      if (canCreate) setChoiceDialogOpen(true);
      void routeNavigate({
        to: "/dashboard/gabinet/deliveries",
        search: { action: undefined },
        replace: true,
      });
    }
  }, [actionParam, routeNavigate, canCreate]);

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
  const [postResult, setPostResult] = useState<{ movementsCreated: number } | null>(null);

  // Cancel delivery confirmation
  const [cancelTarget, setCancelTarget] = useState<{ id: string; label: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Choice dialog (shown when navigating from Products "Dodaj dostawę")
  const [choiceDialogOpen, setChoiceDialogOpen] = useState(false);

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
    setLocationId(activeLocationId ?? NO_LOCATION);
    setNotes("");
    setItems([newLine()]);
    setEditInvoicePageUrls([]);
    setEditAnalysisStatus(null);
    setEditAnalysisItems([]);
    setEditProposals(null);
    setEditItemDecisions(null);
  }, [activeLocationId]);

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
      const result = await postDeliveryAction({ organizationId, deliveryId: postTarget.id }) as { movementsCreated: number };
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["supabase", "productStockLevels"] });
      void queryClient.invalidateQueries({ queryKey: ["supabase", "productStockMovements"] });
      setPostResult(result);
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
          canCreate ? (
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
          ) : undefined
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
                const rowItemDecisions =
                  d.itemDecisions != null && typeof d.itemDecisions === "object"
                    ? (d.itemDecisions as ItemDecisions)
                    : null;
                const hasCreateLater =
                  rowItemDecisions != null &&
                  Array.isArray(rowItemDecisions.items) &&
                  rowItemDecisions.items.some((item) => item?.type === "create_later");
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
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditOpen(id)}
                              disabled={editLoading}
                              className="gap-1.5"
                            >
                              {t("gabinet.deliveries.editAction", "Edytuj")}
                            </Button>
                          )}
                          {canEdit && d.matchingProposals != null && (
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
                          {canEdit && (hasCreateLater ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled
                                      className="gap-1.5 pointer-events-none"
                                    >
                                      <CheckCircle className="h-3.5 w-3.5" variant="stroke" />
                                      {t("gabinet.deliveries.postAction", "Zaksięguj")}
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t(
                                    "gabinet.deliveries.postBlockedCreateLater",
                                    "Najpierw rozwiąż pozycje „Utwórz później” w weryfikacji faktury.",
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setPostTarget({ id, label })}
                              className="gap-1.5"
                            >
                              <CheckCircle className="h-3.5 w-3.5" variant="stroke" />
                              {t("gabinet.deliveries.postAction", "Zaksięguj")}
                            </Button>
                          ))}
                          {canDelete && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setCancelTarget({ id, label })}
                              className="gap-1.5 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" variant="stroke" />
                              {t("gabinet.deliveries.cancelAction", "Usuń")}
                            </Button>
                          )}
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
                <Select value={locationId} onValueChange={(v) => { setLocationId(v); setActiveLocationId(v === NO_LOCATION ? null : v); }}>
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

      {/* Post delivery result summary */}
      <Dialog open={!!postResult} onOpenChange={(o) => { if (!o) setPostResult(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" variant="stroke" />
              {t("gabinet.deliveries.postDoneTitle", "Dostawa zaksięgowana")}
            </DialogTitle>
            <DialogDescription>
              {t("gabinet.deliveries.postDoneDesc", "Stany magazynowe zostały zaktualizowane.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("gabinet.deliveries.decisions.summaryImported", "Produktów dodanych do magazynu")}
              </span>
              <span className="font-semibold tabular-nums">{postResult?.movementsCreated}</span>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setPostResult(null)}>
              {t("common.close", "Zamknij")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Item decisions dialog (#3055, #3073) */}
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
          saveAction={saveItemDecisionsAction as unknown as (args: { organizationId: Id<"organizations">; deliveryId: string; decisions: unknown }) => Promise<void>}
          postDeliveryAction={postDeliveryFromDecisionsAction as (args: { organizationId: typeof organizationId; deliveryId: string }) => Promise<PostDeliveryResult>}
          onPosted={() => {
            void queryClient.invalidateQueries({ queryKey });
            void queryClient.invalidateQueries({ queryKey: ["supabase", "productStockLevels"] });
            void queryClient.invalidateQueries({ queryKey: ["supabase", "productStockMovements"] });
          }}
        />
      )}

      {/* Delivery creation method choice dialog (#3163) */}
      <DeliveryChoiceDialog
        open={choiceDialogOpen}
        onOpenChange={setChoiceDialogOpen}
        onInvoice={() => {
          setChoiceDialogOpen(false);
          setInvoiceDialogOpen(true);
        }}
        onManual={() => {
          setChoiceDialogOpen(false);
          setPanelOpen(true);
        }}
      />
    </div>
  );
}
