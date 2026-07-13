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
import { useSupabaseProductsList } from "@/hooks/use-supabase-products";
import { useSupabaseGabinetLocationsList } from "@/hooks/use-supabase-gabinet-locations";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/deliveries",
)({
  component: DeliveriesPage,
});

const NO_LOCATION = "__none__";

interface LineItem {
  id: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
}

function newLine(): LineItem {
  return { id: crypto.randomUUID(), productId: "", quantity: "", unitPrice: "", vatRate: "" };
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

function formatDate(ms: number | null | undefined) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("pl-PL");
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

  const stockableProducts = useMemo(
    () => productsData.filter((p) => p.isActive && p.trackStock),
    [productsData],
  );

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
              vatRate: item.vatRate != null ? String(item.vatRate) : "",
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

  const updateLine = (id: string, field: keyof LineItem, value: string) =>
    setItems((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));

  const validItems = useMemo(
    () =>
      items.filter(
        (l) => l.productId && (parseNum(l.quantity) ?? 0) > 0,
      ),
    [items],
  );

  const canSubmit = validItems.length > 0 && !submitting;

  const handleSave = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const resolvedLocation =
        locationId !== NO_LOCATION ? (locationId as Id<"gabinetLocations">) : undefined;
      const itemsPayload = validItems.map((l) => ({
        productId: l.productId,
        quantity: parseNum(l.quantity)!,
        unitPrice: parseNum(l.unitPrice) ?? undefined,
        vatRate: parseNum(l.vatRate) ?? undefined,
      }));

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
                  {t("gabinet.deliveries.col.totalValue", "Wartość")}
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
                      {typeof d.totalValue === "number"
                        ? d.totalValue.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">{statusBadge(status, t)}</td>
                    <td className="px-4 py-3 text-right">
                      {status === "draft" && (
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
              {/* header */}
              <div className="grid grid-cols-[1fr_80px_90px_70px_32px] gap-1.5 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>{t("gabinet.deliveries.colProduct", "Produkt")}</span>
                <span className="text-right">{t("gabinet.deliveries.colQty", "Ilość")}</span>
                <span className="text-right">{t("gabinet.deliveries.colUnitPrice", "Cena jedn.")}</span>
                <span className="text-right">{t("gabinet.deliveries.colVat", "VAT %")}</span>
                <span />
              </div>
              <div className="divide-y">
                {items.map((line) => (
                  <div
                    key={line.id}
                    className="grid grid-cols-[1fr_80px_90px_70px_32px] items-center gap-1.5 px-3 py-2"
                  >
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

                    <Input
                      className="h-8 text-right text-xs tabular-nums"
                      placeholder="23"
                      inputMode="decimal"
                      value={line.vatRate}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v))
                          updateLine(line.id, "vatRate", v);
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
                ))}
              </div>
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
