import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { SidePanel } from "@/components/crm/side-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Package, Pencil } from "@/lib/ez-icons";
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Id } from "@cvx/_generated/dataModel";
import { EmptyState } from "@/components/layout/empty-state";
import { QuickActionBar } from "@/components/crm/quick-action-bar";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/packages/"
)({
  component: PackagesIndex,
});

function PackagesIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const createPkg = useMutation(api["gabinet/packages"].create);
  const updatePkg = useMutation(api["gabinet/packages"].update);
  const removePkg = useMutation(api["gabinet/packages"].remove);

  const { data: packages } = useQuery(
    convexQuery(api["gabinet/packages"].list, {
      organizationId,
      paginationOpts: { numItems: 50, cursor: null },
    })
  );

  const { data: treatments } = useQuery(
    convexQuery(api["gabinet/treatments"].listActive, { organizationId })
  );

  const { data: activeUsageCounts } = useQuery(
    convexQuery(api["gabinet/packages"].getActiveUsageCounts, { organizationId })
  );

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"gabinetTreatmentPackages"> | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [validityDays, setValidityDays] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [loyaltyPoints, setLoyaltyPoints] = useState("");
  const [selectedTreatments, setSelectedTreatments] = useState<Array<{ treatmentId: string; quantity: number }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<"gabinetTreatmentPackages"> | null>(null);

  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setTotalPrice("");
    setValidityDays("");
    setDiscountPercent("");
    setLoyaltyPoints("");
    setSelectedTreatments([]);
    setEditingId(null);
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setPanelOpen(true);
  }, [resetForm]);

  const openEdit = useCallback((pkg: {
    _id: Id<"gabinetTreatmentPackages">;
    name: string;
    description?: string;
    totalPrice: number;
    validityDays?: number;
    discountPercent?: number;
    loyaltyPointsAwarded?: number;
    treatments: Array<{ treatmentId: Id<"gabinetTreatments">; quantity: number }>;
  }) => {
    setEditingId(pkg._id);
    setName(pkg.name);
    setDescription(pkg.description ?? "");
    setTotalPrice(String(pkg.totalPrice));
    setValidityDays(pkg.validityDays ? String(pkg.validityDays) : "");
    setDiscountPercent(pkg.discountPercent ? String(pkg.discountPercent) : "");
    setLoyaltyPoints(pkg.loyaltyPointsAwarded ? String(pkg.loyaltyPointsAwarded) : "");
    setSelectedTreatments(
      pkg.treatments.map((t) => ({ treatmentId: t.treatmentId, quantity: t.quantity }))
    );
    setPanelOpen(true);
  }, []);

  const addTreatment = () => {
    if (treatments && treatments.length > 0) {
      setSelectedTreatments((prev) => [...prev, { treatmentId: treatments[0]._id, quantity: 1 }]);
    }
  };

  const removeTreatment = (index: number) => {
    setSelectedTreatments((prev) => prev.filter((_, i) => i !== index));
  };

  const updateTreatment = (index: number, field: "treatmentId" | "quantity", value: string | number) => {
    setSelectedTreatments((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  };

  const handleSubmit = async () => {
    if (!name || !totalPrice || selectedTreatments.length === 0) return;
    setSubmitting(true);
    try {
      const treatmentsList = selectedTreatments.map((t) => ({
        treatmentId: t.treatmentId as Id<"gabinetTreatments">,
        quantity: t.quantity,
      }));

      if (editingId) {
        await updatePkg({
          organizationId,
          packageId: editingId,
          name,
          description: description || undefined,
          treatments: treatmentsList,
          totalPrice: parseFloat(totalPrice),
          validityDays: validityDays ? parseInt(validityDays) : undefined,
          discountPercent: discountPercent ? parseFloat(discountPercent) : undefined,
          loyaltyPointsAwarded: loyaltyPoints ? parseInt(loyaltyPoints) : undefined,
        });
        toast.success(t("common.saved"));
      } else {
        await createPkg({
          organizationId,
          name,
          description: description || undefined,
          treatments: treatmentsList,
          totalPrice: parseFloat(totalPrice),
          validityDays: validityDays ? parseInt(validityDays) : undefined,
          discountPercent: discountPercent ? parseFloat(discountPercent) : undefined,
          loyaltyPointsAwarded: loyaltyPoints ? parseInt(loyaltyPoints) : undefined,
        });
        toast.success(t("gabinet.packages.created"));
      }
      setPanelOpen(false);
      resetForm();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (id: Id<"gabinetTreatmentPackages">) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleRemove = async () => {
    if (!deletingId) return;
    try {
      await removePkg({ organizationId, packageId: deletingId });
      toast.success(t("common.deleted"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleteDialogOpen(false);
      setDeletingId(null);
    }
  };

  const items = packages?.page ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <PageHeader title={t("gabinet.packages.title")} description={t("gabinet.packages.description")} />
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t("gabinet.packages.addPackage")}
        </Button>
      </div>

      <QuickActionBar
        actions={[
          {
            label: t('quickActions.newPackage'),
            icon: <Plus className="mr-1.5 h-3.5 w-3.5" />,
            onClick: openCreate,
            feature: "gabinet_packages",
            action: "create",
          },
        ]}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={t("gabinet.packages.emptyTitle")}
          description={t("gabinet.packages.emptyDescription")}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((pkg) => (
            <div key={pkg._id} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{pkg.name}</h3>
                  {pkg.description && <p className="text-sm text-muted-foreground">{pkg.description}</p>}
                </div>
                <Badge variant={pkg.isActive ? "default" : "secondary"}>
                  {pkg.isActive ? t("gabinet.packages.active") : t("gabinet.packages.inactive")}
                </Badge>
              </div>
              <div className="text-2xl font-bold">{pkg.totalPrice} {pkg.currency ?? "PLN"}</div>
              <div className="text-xs text-muted-foreground">
                {pkg.treatments.length} {t("gabinet.packages.treatments")}
                {pkg.validityDays && ` · ${pkg.validityDays} ${t("gabinet.packages.days")}`}
                {pkg.discountPercent && ` · ${pkg.discountPercent}% ${t("gabinet.packages.discount")}`}
              </div>
              {(activeUsageCounts?.[pkg._id] ?? 0) > 0 && (
                <div className="text-xs">
                  <Badge variant="outline" className="text-xs">
                    {activeUsageCounts![pkg._id]} {t("gabinet.packages.activeUses", "active uses")}
                  </Badge>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => openEdit(pkg)}>
                  <Pencil className="mr-1 h-3 w-3" /> {t("detail.actions.edit")}
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => confirmDelete(pkg._id)}>
                  <Trash2 className="mr-1 h-3 w-3" /> {t("common.delete")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SidePanel
        open={panelOpen}
        onOpenChange={(open) => { setPanelOpen(open); if (!open) resetForm(); }}
        title={editingId ? t("gabinet.packages.editPackage") : t("gabinet.packages.addPackage")}
        onSubmit={handleSubmit}
        isSubmitting={submitting}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("gabinet.packages.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("gabinet.packages.descriptionField")}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("gabinet.packages.totalPrice")}</Label>
              <Input type="number" value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.packages.validityDays")}</Label>
              <Input type="number" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("gabinet.packages.discountPercent")}</Label>
              <Input type="number" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.packages.loyaltyPoints")}</Label>
              <Input type="number" value={loyaltyPoints} onChange={(e) => setLoyaltyPoints(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("gabinet.packages.treatments")}</Label>
              <Button type="button" variant="outline" size="sm" onClick={addTreatment}>
                <Plus className="mr-1 h-3 w-3" /> {t("common.add")}
              </Button>
            </div>
            {selectedTreatments.map((st, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={st.treatmentId} onValueChange={(val) => updateTreatment(i, "treatmentId", val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(treatments ?? []).map((tr) => (
                      <SelectItem key={tr._id} value={tr._id}>{tr.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  className="w-20"
                  value={st.quantity}
                  onChange={(e) => updateTreatment(i, "quantity", parseInt(e.target.value) || 1)}
                  min={1}
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeTreatment(i)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </SidePanel>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("gabinet.packages.confirmDeleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
