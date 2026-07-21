import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseGabinetTreatmentPackagesList, useSupabaseGabinetPackageUsageActive, useSupabaseGabinetPackageUsageUnassigned } from "@/hooks/use-supabase-gabinet-packages";
import { useSupabaseGabinetTreatmentsList } from "@/hooks/use-supabase-gabinet-treatments";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { PageHeader } from "@/components/layout/page-header";
import { SidePanel } from "@/components/crm/side-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor, plateJsonToText } from "@/components/gabinet/rich-text-editor";
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
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Trash2, Package, Pencil, X, Gift, Search } from "@/lib/ez-icons";
import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";

import { EmptyState } from "@/components/layout/empty-state";
import { QuickActionBar } from "@/components/crm/quick-action-bar";
import { SellPackagePanel } from "@/components/gabinet/sell-package-panel";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import type { MappedGabinetTreatmentPackage } from "@/lib/supabase/mappers/gabinet/treatment-packages";
import type { MappedGabinetPackageUsage } from "@/lib/supabase/mappers/gabinet/package-usage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSupabaseGabinetPatientsList } from "@/hooks/use-supabase-gabinet-patients";
import { PatientForm } from "@/components/forms/patient-form";

// shadcn/studio statistics blocks
import StatisticsOrderCard from "@/components/shadcn-studio/blocks/statistics-order-card";
import StatisticsProfitCard from "@/components/shadcn-studio/blocks/statistics-profit-card";
import StatisticsImpressionCard from "@/components/shadcn-studio/blocks/statistics-impression-card";
import { PermissionGate } from "@/hooks/use-permission";
import { Skeleton } from "@/components/ui/skeleton";

// Type alias for Convex mutation compatibility (Knowledge Pattern #9/#12)
type TreatmentPackage = MappedGabinetTreatmentPackage;

type PackagesNudgeFilter = "expiring" | "no-usage";

function PackagesIndexSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/packages/"
)({
  component: () => (
    <PermissionGate feature="gabinet_packages" action="view" loadingFallback={<PackagesIndexSkeleton />}>
      <PackagesIndex />
    </PermissionGate>
  ),
  validateSearch: (
    search: Record<string, unknown>,
  ): { nudge?: PackagesNudgeFilter } => {
    const nudge =
      search.nudge === "expiring" || search.nudge === "no-usage"
        ? (search.nudge as PackagesNudgeFilter)
        : undefined;
    return { nudge };
  },
});

// ---------------------------------------------------------------------------
// Client-side aggregation helpers (replace Convex server-side queries)
// ---------------------------------------------------------------------------

/** Build { [packageId]: activeCount } from raw usage rows */
function buildActiveUsageCounts(usages: MappedGabinetPackageUsage[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const u of usages) {
    counts[u.packageId] = (counts[u.packageId] ?? 0) + 1;
  }
  return counts;
}

/** Build per-package treatment progress from raw usage rows */
function buildActiveUsageDetails(
  usages: MappedGabinetPackageUsage[],
): Record<string, { count: number; treatmentProgress: Record<string, { usedCount: number; totalCount: number }> }> {
  const byPackage: Record<
    string,
    { count: number; treatmentProgress: Record<string, { usedCount: number; totalCount: number }> }
  > = {};

  for (const u of usages) {
    if (!byPackage[u.packageId]) {
      byPackage[u.packageId] = { count: 0, treatmentProgress: {} };
    }
    byPackage[u.packageId].count += 1;
    for (const t of u.treatmentsUsed) {
      const key = t.treatmentId;
      if (!byPackage[u.packageId].treatmentProgress[key]) {
        byPackage[u.packageId].treatmentProgress[key] = { usedCount: 0, totalCount: 0 };
      }
      byPackage[u.packageId].treatmentProgress[key].usedCount += t.usedCount;
      byPackage[u.packageId].treatmentProgress[key].totalCount += t.totalCount;
    }
  }

  return byPackage;
}

/** Derive KPIs from packages list + active usage data */
function derivePackageKpis(
  packages: MappedGabinetTreatmentPackage[],
  activeUsages: MappedGabinetPackageUsage[],
): { totalPackages: number; activePackages: number; soldActiveUsages: number; expiringPackages: number } {
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  return {
    totalPackages: packages.length,
    activePackages: packages.filter((p) => p.isActive).length,
    soldActiveUsages: activeUsages.length,
    expiringPackages: activeUsages.filter(
      (u) => u.expiresAt != null && u.expiresAt > now && u.expiresAt <= now + thirtyDays,
    ).length,
  };
}

function PackagesIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { nudge: nudgeFilter } = useSearch({ from: Route.id });

  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const createPkg = useAction(api.gabinet.packages.create);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const updatePkg = useAction(api.gabinet.packages.update);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const removePkg = useAction(api.gabinet.packages.remove);

  // Supabase-backed queries (replacing convexQuery)
  const { data: packagesData } = useSupabaseGabinetTreatmentPackagesList(organizationId);
  const { data: treatmentsData } = useSupabaseGabinetTreatmentsList(organizationId, { isActive: true });
  const { data: activeUsagesData } = useSupabaseGabinetPackageUsageActive(organizationId);

  const treatments = useMemo(
    () => treatmentsData ?? [],
    [treatmentsData],
  );

  // Client-side aggregation (replaces getActiveUsageCounts, getActiveUsageDetails, getPackagesKpis)
  const activeUsageCounts = useMemo(
    () => buildActiveUsageCounts(activeUsagesData ?? []),
    [activeUsagesData],
  );
  const activeUsageDetails = useMemo(
    () => buildActiveUsageDetails(activeUsagesData ?? []),
    [activeUsagesData],
  );
  const pkgKpis = useMemo(
    () => derivePackageKpis(packagesData ?? [], activeUsagesData ?? []),
    [packagesData, activeUsagesData],
  );

  const { data: unassignedGiftData } = useSupabaseGabinetPackageUsageUnassigned(organizationId);
  const { data: patientsData } = useSupabaseGabinetPatientsList(organizationId);

  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const assignGiftPkg = useAction(api.gabinet.packages.assignGiftPackage);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const createPatient = useAction(api.gabinet.patients.create);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [assignPanelOpen, setAssignPanelOpen] = useState(false);
  const [giftSearch, setGiftSearch] = useState("");
  const [assigningGiftId, setAssigningGiftId] = useState<string | null>(null);
  const [assignPatientId, setAssignPatientId] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [createPatientPanelOpen, setCreatePatientPanelOpen] = useState(false);
  const [creatingPatient, setCreatingPatient] = useState(false);

  useSidebarDispatch("openFilter", () => setFilterPanelOpen(true));
  useSidebarDispatch("viewExpiring", () => setExpiringOnly(true));
  useSidebarDispatch("assignPackage", () => setAssignPanelOpen(true));

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [validityDays, setValidityDays] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [loyaltyPoints, setLoyaltyPoints] = useState("");
  const [selectedTreatments, setSelectedTreatments] = useState<Array<{ treatmentId: string; quantity: number }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Cache invalidation helper
  const invalidatePackages = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetTreatmentPackages.list(organizationId) });
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetPackageUsage.list(organizationId) });
  }, [queryClient, organizationId]);

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

  const openEdit = useCallback((pkg: TreatmentPackage) => {
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
    setSelectedTreatments((prev) => [
      ...prev,
      { treatmentId: treatments?.[0]?._id ?? "", quantity: 1 },
    ]);
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
    if (selectedTreatments.some((t) => !t.treatmentId || t.quantity < 1)) return;
    setSubmitting(true);
    try {
      const treatmentsList = selectedTreatments.map((t) => ({
        treatmentId: t.treatmentId,
        quantity: t.quantity,
      }));

      if (editingId) {
        await updatePkg({
          organizationId,
          packageId: editingId,
          name,
          description: description || null,
          treatments: treatmentsList,
          totalPrice: parseFloat(totalPrice),
          validityDays: validityDays ? parseInt(validityDays) : null,
          discountPercent: discountPercent ? parseFloat(discountPercent) : null,
          loyaltyPointsAwarded: loyaltyPoints ? parseInt(loyaltyPoints) : null,
        });
        toast.success(t("common.saved"));
      } else {
        await createPkg({
          organizationId,
          name,
          description: description || null,
          treatments: treatmentsList,
          totalPrice: parseFloat(totalPrice),
          validityDays: validityDays ? parseInt(validityDays) : null,
          discountPercent: discountPercent ? parseFloat(discountPercent) : null,
          loyaltyPointsAwarded: loyaltyPoints ? parseInt(loyaltyPoints) : null,
        });
        toast.success(t("gabinet.packages.created"));
      }
      invalidatePackages();
      setPanelOpen(false);
      resetForm();
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.packages.errors.saveFailed",
          defaultValue: "Nie udało się zapisać pakietu.",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleRemove = async () => {
    if (!deletingId) return;
    try {
      await removePkg({ organizationId, packageId: deletingId });
      toast.success(t("common.deleted"));
      invalidatePackages();
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.packages.errors.deleteFailed",
          defaultValue: "Nie udało się usunąć pakietu.",
        }),
      );
    } finally {
      setDeleteDialogOpen(false);
      setDeletingId(null);
    }
  };

  const handleAssignGift = async () => {
    if (!assigningGiftId || !assignPatientId) return;
    setAssignSubmitting(true);
    try {
      await assignGiftPkg({ organizationId, usageId: assigningGiftId, patientId: assignPatientId });
      toast.success(t("gabinet.packages.giftAssigned", "Voucher przypisany do pacjenta."));
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetPackageUsage.list(organizationId) });
      setAssigningGiftId(null);
      setAssignPatientId("");
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.packages.errors.assignFailed",
          defaultValue: "Nie udało się przypisać vouchera.",
        }),
      );
    } finally {
      setAssignSubmitting(false);
    }
  };

  const handleCreatePatient = async (formData: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    pesel?: string | null;
    dateOfBirth?: string | null;
    gender?: "male" | "female" | "other";
    address?: { street?: string; city?: string; postalCode?: string } | null;
    medicalNotes?: string | null;
    allergies?: string | null;
    bloodType?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    referralSource?: string | null;
  }) => {
    setCreatingPatient(true);
    try {
      const newId = await createPatient({ organizationId, ...formData });
      setAssignPatientId(String(newId));
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetPatients.list(organizationId) });
      setCreatePatientPanelOpen(false);
      toast.success(t("gabinet.patients.created", { defaultValue: "Klient utworzony" }));
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.patients.errors.createFailed",
          defaultValue: "Nie udało się utworzyć klienta.",
        }),
      );
    } finally {
      setCreatingPatient(false);
    }
  };

  const filteredGiftPackages = useMemo(() => {
    const usages = unassignedGiftData ?? [];
    if (!giftSearch.trim()) return usages;
    const q = giftSearch.toLowerCase();
    return usages.filter(
      (u) =>
        (u.voucherCode ?? "").toLowerCase().includes(q) ||
        (u.giftRecipientName ?? "").toLowerCase().includes(q) ||
        (u.giftRecipientPhone ?? "").toLowerCase().includes(q) ||
        (u.giftRecipientEmail ?? "").toLowerCase().includes(q),
    );
  }, [unassignedGiftData, giftSearch]);

  const expiringPackageIds = useMemo(() => {
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const ids = new Set<string>();
    for (const u of activeUsagesData ?? []) {
      if (u.expiresAt != null && u.expiresAt > now && u.expiresAt <= now + thirtyDays) {
        ids.add(u.packageId);
      }
    }
    return ids;
  }, [activeUsagesData]);

  const items = useMemo(() => {
    let all = packagesData ?? [];
    if (statusFilter === "active") all = all.filter((p) => p.isActive);
    else if (statusFilter === "inactive") all = all.filter((p) => !p.isActive);
    if (expiringOnly || nudgeFilter === "expiring") {
      all = all.filter((p) => expiringPackageIds.has(p._id));
    }
    if (nudgeFilter === "no-usage") {
      all = all.filter((p) => p.isActive && (activeUsageCounts[p._id] ?? 0) === 0);
    }
    return all;
  }, [packagesData, statusFilter, expiringOnly, expiringPackageIds, nudgeFilter, activeUsageCounts]);

  // Build a treatment name lookup from loaded treatments
  const treatmentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const tr of treatments ?? []) {
      map.set(tr._id, tr.name);
    }
    return map;
  }, [treatments]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader title={t("gabinet.packages.title")} description={t("gabinet.packages.description")} />
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" variant="stroke" />
          {t("gabinet.packages.addPackage")}
        </Button>
      </div>

      {/* KPI Statistics Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatisticsOrderCard
          title={t("gabinet.packages.totalPackages", "Pakiety")}
          description={t("gabinet.packages.inCatalog", "W ofercie")}
          value={String(pkgKpis.totalPackages)}
          changePercentage={`${pkgKpis.activePackages} ${t("gabinet.packages.active", "aktywnych")}`}
        />
        <StatisticsProfitCard
          title={t("gabinet.packages.activePackages", "Aktywne wykupione")}
          description={t("gabinet.packages.inUse", "W użyciu")}
          value={String(pkgKpis.soldActiveUsages)}
          changePercentage={t("gabinet.packages.byPatients", "u klientów")}
        />
        <StatisticsImpressionCard
          title={t("gabinet.packages.expiringSoon", "Wygasające")}
          description={t("gabinet.packages.next30Days", "W ciągu 30 dni")}
          value={String(pkgKpis.expiringPackages)}
          changePercentage={
            pkgKpis.expiringPackages > 0
              ? t("gabinet.packages.needsRenewal", "do odnowienia")
              : t("gabinet.packages.allGood", "wszystko ok")
          }
        />
      </div>

      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">
            <Package className="mr-1.5 h-4 w-4" variant="stroke" />
            {t("gabinet.packages.tabCatalog", "Katalog")}
          </TabsTrigger>
          <TabsTrigger value="gifts">
            <Gift className="mr-1.5 h-4 w-4" variant="stroke" />
            {t("gabinet.packages.tabGifts", "Vouchery")}
            {(unassignedGiftData?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {unassignedGiftData!.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-4 space-y-4">
          {expiringOnly && !nudgeFilter && (
            <div className="flex items-center justify-between rounded-md border bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm">
              <span>
                {t("gabinet.packages.expiringFilterActive", {
                  count: expiringPackageIds.size,
                  defaultValue: "Showing packages with usages expiring within 30 days ({{count}})",
                })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setExpiringOnly(false)}>
                {t("common.clearFilters")}
              </Button>
            </div>
          )}

          {nudgeFilter && (
            <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <span>
                {nudgeFilter === "expiring"
                  ? t("gabinet.packages.nudgeFilter.expiring", {
                      defaultValue:
                        "Pokazywane są pakiety z użyciami wygasającymi w ciągu 30 dni.",
                    })
                  : t("gabinet.packages.nudgeFilter.noUsage", {
                      defaultValue:
                        "Pokazywane są aktywne pakiety bez aktywnych użyć.",
                    })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() =>
                  navigate({
                    to: "/dashboard/gabinet/packages",
                    search: { nudge: undefined },
                  })
                }
              >
                <X className="h-3.5 w-3.5" variant="stroke" />
                {t("common.clearFilters")}
              </Button>
            </div>
          )}

          <QuickActionBar
            actions={[
              {
                label: t('quickActions.newPackage'),
                icon: <Plus className="mr-1.5 h-4 w-4" variant="stroke" />,
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
              {items.map((pkg) => {
            const usageDetail = activeUsageDetails[pkg._id];
            const activeCount = activeUsageCounts[pkg._id] ?? 0;

            return (
              <div key={pkg._id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{pkg.name}</h3>
                    {pkg.description && (() => {
                      const descText = plateJsonToText(pkg.description);
                      return descText ? (
                        <p className="text-sm text-muted-foreground whitespace-pre-line">{descText}</p>
                      ) : null;
                    })()}
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

                {/* Per-treatment progress bars */}
                {activeCount > 0 && usageDetail && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-medium text-muted-foreground">{t("gabinet.packages.treatmentProgress")}</p>
                    {pkg.treatments.map((tr) => {
                      const progress = usageDetail.treatmentProgress[tr.treatmentId];
                      const usedCount = progress?.usedCount ?? 0;
                      const totalCount = progress?.totalCount ?? 0;
                      const remaining = totalCount - usedCount;
                      const percent = totalCount > 0 ? Math.round((usedCount / totalCount) * 100) : 0;
                      const remainingRatio = totalCount > 0 ? remaining / totalCount : 1;
                      const treatmentName = treatmentNameMap.get(tr.treatmentId) ?? t("gabinet.packages.treatment");

                      // Color coding: green when plenty, amber when <30%, red when <10%
                      let progressColor = "bg-emerald-500";
                      let statusLabel = t("gabinet.packages.plentyRemaining");
                      if (remainingRatio <= 0) {
                        progressColor = "bg-red-500";
                        statusLabel = t("gabinet.packages.fullyUsed");
                      } else if (remainingRatio < 0.1) {
                        progressColor = "bg-red-500";
                        statusLabel = t("gabinet.packages.almostExhausted");
                      } else if (remainingRatio < 0.3) {
                        progressColor = "bg-amber-500";
                        statusLabel = t("gabinet.packages.runningLow");
                      }

                      return (
                        <TooltipProvider key={tr.treatmentId}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="truncate max-w-[60%]">{treatmentName}</span>
                                  <span className="text-muted-foreground tabular-nums">
                                    {usedCount} / {totalCount}
                                  </span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all rounded-full ${progressColor}`}
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{treatmentName}: {statusLabel}</p>
                              <p className="text-xs text-muted-foreground">
                                {t("gabinet.packages.totalRemaining", { remaining, total: totalCount })}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}

                    {/* Overall package completion */}
                    {(() => {
                      const overallUsed = Object.values(usageDetail.treatmentProgress).reduce((s, p) => s + p.usedCount, 0);
                      const overallTotal = Object.values(usageDetail.treatmentProgress).reduce((s, p) => s + p.totalCount, 0);
                      const overallPercent = overallTotal > 0 ? Math.round((overallUsed / overallTotal) * 100) : 0;
                      return (
                        <div className="pt-1 border-t mt-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">{t("gabinet.packages.overallProgress")}</span>
                            <span className="text-muted-foreground tabular-nums">{t("gabinet.packages.completionPercent", { percent: overallPercent })}</span>
                          </div>
                          <Progress value={overallPercent} className="h-2 mt-1" />
                        </div>
                      );
                    })()}
                  </div>
                )}

                {activeCount > 0 && (
                  <div className="text-xs">
                    <Badge variant="outline" className="text-xs">
                      {activeCount} {t("gabinet.packages.activeUses")}
                    </Badge>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(pkg)}>
                    <Pencil className="mr-1 h-4 w-4" variant="stroke" /> {t("detail.actions.edit")}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => confirmDelete(pkg._id)}>
                    <Trash2 className="mr-1 h-4 w-4" variant="stroke" /> {t("common.delete")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </TabsContent>

        <TabsContent value="gifts" className="mt-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" variant="stroke" />
            <Input
              className="pl-9"
              placeholder={t("gabinet.packages.giftSearch", "Szukaj po kodzie vouchera, nazwisku lub e-mailu...")}
              value={giftSearch}
              onChange={(e) => setGiftSearch(e.target.value)}
            />
          </div>

          {filteredGiftPackages.length === 0 ? (
            <EmptyState
              icon={Gift}
              title={t("gabinet.packages.giftEmptyTitle", "Brak nieprzypisanych voucherów")}
              description={t("gabinet.packages.giftEmptyDescription", "Sprzedane vouchery podarunkowe, które nie zostały jeszcze przypisane do pacjenta, pojawią się tutaj.")}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredGiftPackages.map((usage) => {
                const pkg = (packagesData ?? []).find((p) => p._id === usage.packageId);
                return (
                  <div key={usage._id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-medium truncate">{pkg?.name ?? t("gabinet.packages.unknownPackage", "Nieznany pakiet")}</h3>
                        {usage.voucherCode && (
                          <p className="text-sm font-mono text-muted-foreground">{usage.voucherCode}</p>
                        )}
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {t("gabinet.packages.unassigned", "Nieprzypisany")}
                      </Badge>
                    </div>

                    {(usage.giftRecipientName || usage.giftRecipientPhone || usage.giftRecipientEmail) && (
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        {usage.giftRecipientName && <p>{usage.giftRecipientName}</p>}
                        {usage.giftRecipientPhone && <p>{usage.giftRecipientPhone}</p>}
                        {usage.giftRecipientEmail && <p>{usage.giftRecipientEmail}</p>}
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                      {t("gabinet.packages.purchasedAt", "Zakupiono")}: {new Date(usage.purchasedAt).toLocaleDateString("pl-PL")}
                      {usage.expiresAt && (
                        <> · {t("gabinet.packages.expiresAt", "Ważny do")}: {new Date(usage.expiresAt).toLocaleDateString("pl-PL")}</>
                      )}
                    </div>

                    <div className="text-sm font-semibold">{usage.paidAmount} PLN</div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => { setAssigningGiftId(usage._id); setAssignPatientId(""); }}
                    >
                      <Gift className="mr-1.5 h-4 w-4" variant="stroke" />
                      {t("gabinet.packages.assignToPatient", "Przypisz do pacjenta")}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

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
            <RichTextEditor value={description} onChange={(val) => setDescription(val ?? "")} minHeight="80px" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("gabinet.packages.totalPrice")}</Label>
              <Input type="number" inputMode="decimal" value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.packages.validityDays")}</Label>
              <Input type="number" inputMode="numeric" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("gabinet.packages.discountPercent")}</Label>
              <Input type="number" inputMode="numeric" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.packages.loyaltyPoints")}</Label>
              <Input type="number" inputMode="numeric" value={loyaltyPoints} onChange={(e) => setLoyaltyPoints(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("gabinet.packages.treatmentsInPackage")}</Label>
              <Button type="button" variant="outline" size="sm" onClick={addTreatment}>
                <Plus className="mr-1 h-4 w-4" variant="stroke" /> {t("common.add")}
              </Button>
            </div>
            {selectedTreatments.length === 0 && (
              <p className="text-sm text-muted-foreground py-1">
                {t("gabinet.packages.noTreatments")}
              </p>
            )}
            {selectedTreatments.map((st, i) => (
              <div key={i} className="rounded-md border p-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("gabinet.packages.treatment")}
                    </Label>
                    <Select value={st.treatmentId} onValueChange={(val) => updateTreatment(i, "treatmentId", val)}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("gabinet.packages.treatment")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(treatments ?? []).length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            {t("gabinet.packages.noTreatmentsAvailable")}
                          </SelectItem>
                        ) : (
                          (treatments ?? []).map((tr) => (
                            <SelectItem key={tr._id} value={tr._id}>{tr.name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24 shrink-0 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("gabinet.packages.quantity")}
                    </Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={st.quantity}
                      onChange={(e) => updateTreatment(i, "quantity", parseInt(e.target.value) || 1)}
                      min={1}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => removeTreatment(i)}
                    aria-label={t("common.delete")}
                  >
                    <Trash2 className="h-4 w-4" variant="stroke" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SidePanel>

      <SidePanel
        open={filterPanelOpen}
        onOpenChange={setFilterPanelOpen}
        title={t("nav.actions.filterByStatus")}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("common.status")}</Label>
            <RadioGroup
              value={statusFilter}
              onValueChange={(val) => setStatusFilter(val as "all" | "active" | "inactive")}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="package-filter-all" />
                <Label htmlFor="package-filter-all" className="font-normal">
                  {t("common.all")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="active" id="package-filter-active" />
                <Label htmlFor="package-filter-active" className="font-normal">
                  {t("gabinet.packages.active")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="inactive" id="package-filter-inactive" />
                <Label htmlFor="package-filter-inactive" className="font-normal">
                  {t("gabinet.packages.inactive")}
                </Label>
              </div>
            </RadioGroup>
          </div>
          {statusFilter !== "all" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusFilter("all")}
            >
              {t("common.clearFilters")}
            </Button>
          )}
        </div>
      </SidePanel>

      <SellPackagePanel
        organizationId={organizationId}
        open={assignPanelOpen}
        onOpenChange={setAssignPanelOpen}
      />

      <SidePanel
        open={assigningGiftId !== null}
        onOpenChange={(open) => { if (!open) { setAssigningGiftId(null); setAssignPatientId(""); } }}
        title={t("gabinet.packages.assignGiftTitle", "Przypisz voucher do pacjenta")}
        onSubmit={handleAssignGift}
        isSubmitting={assignSubmitting}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("gabinet.packages.assignGiftDescription", "Wybierz pacjenta, do którego zostanie przypisany voucher. Pakiet stanie się aktywny dla wybranego pacjenta.")}
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t("gabinet.patients.patient", "Pacjent")}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => setCreatePatientPanelOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" variant="stroke" />
                {t("gabinet.patients.createPatient", "Nowy pacjent")}
              </Button>
            </div>
            <Select value={assignPatientId} onValueChange={setAssignPatientId}>
              <SelectTrigger>
                <SelectValue placeholder={t("gabinet.packages.selectPatient", "Wybierz pacjenta...")} />
              </SelectTrigger>
              <SelectContent>
                {(patientsData ?? []).length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    {t("gabinet.packages.noPatientsFound", "Brak pacjentów")}
                  </SelectItem>
                ) : (
                  (patientsData ?? []).map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.firstName} {p.lastName}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SidePanel>

      <SidePanel
        open={createPatientPanelOpen}
        onOpenChange={setCreatePatientPanelOpen}
        title={t("gabinet.patients.createPatient", "Nowy pacjent")}
        description={t("gabinet.patients.createDescription", "Wypełnij dane nowego pacjenta.")}
      >
        <PatientForm
          onSubmit={handleCreatePatient}
          onCancel={() => setCreatePatientPanelOpen(false)}
          isSubmitting={creatingPatient}
          organizationId={organizationId}
        />
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
