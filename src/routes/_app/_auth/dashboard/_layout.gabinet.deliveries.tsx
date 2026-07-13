import { useState, useMemo, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { Plus, Trash2, TruckIcon, Loader2, CheckCircle } from "@/lib/ez-icons";
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

function getExpiryStatus(dateStr: string | null): "expired" | "expiring_soon" | "ok" | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3) return null;
  // Parse as local midnight so the expiry day itself is never flagged as expired
  const expiry = new Date(parts[0], parts[1] - 1, parts[2]);
  if (expiry < today) return "expired";
  const soon = new Date(today);
  soon.setDate(today.getDate() + 30);
  if (expiry <= soon) return "expiring_soon";
  return "ok";
}

function formatDate(ms: number | null | undefined) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("pl-PL");
}

function fmtMoney(n: number) {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const handleViewOpen = async (id: string) => {
    setViewLoading(true);
    try {
      const result = await getDeliveryAction({ organizationId, deliveryId: id }) as {
        delivery: Record<string, unknown>;
        items: Array<Record<string, unknown>>;
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

  // Post delivery confirmation
  const [postTarget, setPostTarget] = useState<{ id: string; label: string } | null>(null);
  const [posting, setPosting] = useState(false);

  // Cancel delivery confirmation
  const [cancelTarget, setCancelTarget] = useState<{ id: string; label: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const isEditMode = editDeliveryId !== null;

  const resetPanel = useCallback(() => {
    setEditDeliveryId(null);
    setSupplierName("");
    setInvoiceNumber("");
    setDeliveryDate("");
    setLocationId(NO_LOCATION);
    setNotes("");
    setItems([newLine()]);
  }, []);

  const handleEditOpen = async (id: string) => {
    setEditLoading(true);
    try {
      const result = await getDeliveryAction({ organizationId, deliveryId: id }) as {
        delivery: Record<string, unknown>;
        items: Array<Record<string, unknown>>;
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
      await cancelDeliveryAction({ organizationId, deliveryId: cancelTarget.id });
      toast.success(t("gabinet.deliveries.cancelSuccess", "Dostawa usunięta."));
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
          <Button onClick={() => setPanelOpen(true)}>
            <Plus className="mr-2 h-4 w-4" variant="stroke" />
            {t("gabinet.deliveries.newDelivery", "Nowa dostawa")}
          </Button>
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
                    <td className="px-4 py-3">{statusBadge(status, t)}</td>
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
    </div>
  );
}
