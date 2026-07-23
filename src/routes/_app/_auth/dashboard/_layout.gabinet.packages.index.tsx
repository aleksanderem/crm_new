import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import {
  useSupabaseGabinetTreatmentPackagesList,
  useSupabaseGabinetPackageUsageActive,
  useSupabaseGabinetPackageUsageUnassigned,
} from "@/hooks/use-supabase-gabinet-packages";
import { useSupabaseGabinetTreatmentsList } from "@/hooks/use-supabase-gabinet-treatments";
import { useSupabaseGabinetPatientsList } from "@/hooks/use-supabase-gabinet-patients";
import { PatientForm } from "@/components/forms/patient-form";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { PageHeader } from "@/components/layout/page-header";
import {
  CrmDataTable,
  useColumnVisibility,
  useAllColumns,
} from "@/components/crm/enhanced-data-table";
import type { CrmColumn } from "@/components/crm/enhanced-data-table";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import { SidePanel } from "@/components/crm/side-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  Trash2,
  Package,
  Pencil,
  Power,
  X,
  Gift,
  Search,
  ChevronDown,
  ChevronUp,
} from "@/lib/ez-icons";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { EmptyState } from "@/components/layout/empty-state";
import { SellPackagePanel } from "@/components/gabinet/sell-package-panel";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import type { MappedGabinetTreatmentPackage } from "@/lib/supabase/mappers/gabinet/treatment-packages";
import type { MappedGabinetPackageUsage } from "@/lib/supabase/mappers/gabinet/package-usage";
import type {
  SavedView,
  FieldDef,
  FilterCondition,
} from "@/components/crm/types";
import type { SortDescriptor } from "react-aria-components";
import { Id } from "@cvx/_generated/dataModel";
import { useSavedViews, applyFilterConditions } from "@/hooks/use-saved-views";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { TagsManagerSlideout } from "@/components/categories-tags/tags-manager-slideout";
import { CategoriesManagerSlideout } from "@/components/categories-tags/categories-manager-slideout";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
import { PermissionGate, usePermission } from "@/hooks/use-permission";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// shadcn/studio statistics blocks
import StatisticsOrderCard from "@/components/shadcn-studio/blocks/statistics-order-card";
import StatisticsProfitCard from "@/components/shadcn-studio/blocks/statistics-profit-card";
import StatisticsImpressionCard from "@/components/shadcn-studio/blocks/statistics-impression-card";

type TreatmentPackage = MappedGabinetTreatmentPackage;
type PackagesNudgeFilter = "expiring" | "no-usage";

function PackagesListSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/packages/",
)({
  component: () => (
    <PermissionGate
      feature="gabinet_packages"
      action="view"
      loadingFallback={<PackagesListSkeleton />}
    >
      <PackagesIndex />
    </PermissionGate>
  ),
  validateSearch: (
    search: Record<string, unknown>,
  ): { nudge?: PackagesNudgeFilter; edit?: string } => {
    const nudge =
      search.nudge === "expiring" || search.nudge === "no-usage"
        ? (search.nudge as PackagesNudgeFilter)
        : undefined;
    const edit = typeof search.edit === "string" ? search.edit : undefined;
    return { nudge, edit };
  },
});

// ---------------------------------------------------------------------------
// Client-side aggregation helpers
// ---------------------------------------------------------------------------

function buildActiveUsageCounts(
  usages: MappedGabinetPackageUsage[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const u of usages) {
    counts[u.packageId] = (counts[u.packageId] ?? 0) + 1;
  }
  return counts;
}

function buildActiveUsageDetails(usages: MappedGabinetPackageUsage[]): Record<
  string,
  {
    count: number;
    treatmentProgress: Record<
      string,
      { usedCount: number; totalCount: number }
    >;
  }
> {
  const byPackage: Record<
    string,
    {
      count: number;
      treatmentProgress: Record<
        string,
        { usedCount: number; totalCount: number }
      >;
    }
  > = {};

  for (const u of usages) {
    if (!byPackage[u.packageId]) {
      byPackage[u.packageId] = { count: 0, treatmentProgress: {} };
    }
    byPackage[u.packageId].count += 1;
    for (const t of u.treatmentsUsed) {
      const key = t.treatmentId;
      if (!byPackage[u.packageId].treatmentProgress[key]) {
        byPackage[u.packageId].treatmentProgress[key] = {
          usedCount: 0,
          totalCount: 0,
        };
      }
      byPackage[u.packageId].treatmentProgress[key].usedCount += t.usedCount;
      byPackage[u.packageId].treatmentProgress[key].totalCount += t.totalCount;
    }
  }

  return byPackage;
}

function derivePackageKpis(
  packages: MappedGabinetTreatmentPackage[],
  activeUsages: MappedGabinetPackageUsage[],
): { totalPackages: number; activePackages: number; expiringPackages: number } {
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return {
    totalPackages: packages.length,
    activePackages: packages.filter((p) => p.isActive).length,
    expiringPackages: activeUsages.filter(
      (u) =>
        u.expiresAt != null &&
        u.expiresAt > now &&
        u.expiresAt <= now + thirtyDays,
    ).length,
  };
}

function formatCurrency(amount: number, currency?: string): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: currency ?? "PLN",
  }).format(amount);
}

function PackagesIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { nudge: nudgeFilter, edit: editParam } = useSearch({ from: Route.id });

  // @ts-ignore — TS2589: deep type instantiation in Convex codegen
  const createPkg = useAction(api.gabinet.packages.create);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen
  const updatePkg = useAction(api.gabinet.packages.update);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen
  const removePkg = useAction(api.gabinet.packages.remove);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen
  const assignGift = useAction(api.gabinet.packages.assignGiftPackage);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen
  const createPatient = useAction(api.gabinet.patients.create);

  const { allowed: canEdit } = usePermission("gabinet_packages", "edit");
  const { allowed: canDelete } = usePermission("gabinet_packages", "delete");

  const { tags } = useTagDefinitions(organizationId);
  const { categories } = useCategoryDefinitions(
    organizationId,
    "gabinetPackage",
  );
  const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);
  const [categoriesSlideoutOpen, setCategoriesSlideoutOpen] = useState(false);
  const [filterSlideoutOpen, setFilterSlideoutOpen] = useState(false);
  const [sortDescriptor, setSortDescriptor] = useState<
    SortDescriptor | undefined
  >(undefined);
  const [showStatsMobile, setShowStatsMobile] = useState(false);

  const { data: packagesData, isLoading } =
    useSupabaseGabinetTreatmentPackagesList(organizationId);
  const { data: treatmentsData } = useSupabaseGabinetTreatmentsList(
    organizationId,
    { isActive: true },
  );
  const { data: patientsData } = useSupabaseGabinetPatientsList(organizationId);
  const { data: unassignedUsagesData } =
    useSupabaseGabinetPackageUsageUnassigned(organizationId);
  const { data: activeUsagesData } =
    useSupabaseGabinetPackageUsageActive(organizationId);

  const treatments = useMemo(() => treatmentsData ?? [], [treatmentsData]);

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

  const expiringPackageIds = useMemo(() => {
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const ids = new Set<string>();
    for (const u of activeUsagesData ?? []) {
      if (
        u.expiresAt != null &&
        u.expiresAt > now &&
        u.expiresAt <= now + thirtyDays
      ) {
        ids.add(u.packageId);
      }
    }
    return ids;
  }, [activeUsagesData]);

  const treatmentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const tr of treatments) map.set(tr._id, tr.name);
    return map;
  }, [treatments]);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) map.set(cat._id, cat.name);
    return map;
  }, [categories]);

  // ---- Form state ----
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [validityDays, setValidityDays] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [loyaltyPoints, setLoyaltyPoints] = useState("");
  const [selectedTreatments, setSelectedTreatments] = useState<
    Array<{ treatmentId: string; quantity: number }>
  >([]);
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>([]);
  const [categoryId, setCategoryId] = useState<
    Id<"categoryDefinitions"> | undefined
  >(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ---- Gift / voucher assignment state ----
  const [assignPanelOpen, setAssignPanelOpen] = useState(false);
  const [giftSearch, setGiftSearch] = useState("");
  const [assigningGiftId, setAssigningGiftId] = useState<string | null>(null);
  const [assignPatientId, setAssignPatientId] = useState<string>("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [createPatientPanelOpen, setCreatePatientPanelOpen] = useState(false);
  const [creatingPatient, setCreatingPatient] = useState(false);

  // ---- Saved views + filter ----
  const [activeFilters, setActiveFilters] = useState<FilterCondition[]>([]);
  const [searchValue, setSearchValue] = useState("");

  useSidebarDispatch("manageTags", () => setTagsSlideoutOpen(true));
  useSidebarDispatch("manageCategories", () => setCategoriesSlideoutOpen(true));
  useSidebarDispatch("openFilter", () => setFilterSlideoutOpen(true));
  useSidebarDispatch("assignPackage", () => setAssignPanelOpen(true));
  useSidebarDispatch("viewExpiring", () => {
    // Navigate to expiring nudge filter
    void navigate({
      to: "/dashboard/gabinet/packages",
      search: { nudge: "expiring" },
    });
  });

  const systemViews = useMemo(
    (): SavedView[] => [
      {
        id: "all",
        name: t("gabinet.packages.views.all", "Wszystkie pakiety"),
        isSystem: true,
        isDefault: true,
      },
      {
        id: "active",
        name: t("gabinet.packages.views.active", "Aktywne"),
        isSystem: true,
        isDefault: false,
      },
      {
        id: "inactive",
        name: t("gabinet.packages.views.inactive", "Nieaktywne"),
        isSystem: true,
        isDefault: false,
      },
    ],
    [t],
  );

  const filterableFields = useMemo(
    (): FieldDef[] => [
      { id: "name", label: t("gabinet.packages.name", "Nazwa"), type: "text" },
      {
        id: "totalPrice",
        label: t("gabinet.packages.totalPrice", "Cena"),
        type: "number",
      },
      {
        id: "validityDays",
        label: t("gabinet.packages.validityDays", "Ważność (dni)"),
        type: "number",
      },
      {
        id: "discountPercent",
        label: t("gabinet.packages.discountPercent", "Rabat (%)"),
        type: "number",
      },
      {
        id: "isActive",
        label: t("common.active", "Aktywny"),
        type: "select",
        options: [
          { label: t("common.yes", "Tak"), value: "true" },
          { label: t("common.no", "Nie"), value: "false" },
        ],
      },
      {
        id: "createdAt",
        label: t("common.created", "Utworzono"),
        type: "date",
      },
      {
        id: "tagIds",
        label: t("common.tags", "Tagi"),
        type: "multiSelect" as const,
        options: tags.map((tag) => ({ label: tag.name, value: tag._id })),
      },
      {
        id: "categoryId",
        label: t("common.category", "Kategoria"),
        type: "select" as const,
        options: categories.map((cat) => ({ label: cat.name, value: cat._id })),
      },
    ],
    [t, tags, categories],
  );

  const {
    views,
    activeViewId,
    onViewChange,
    onCreateView,
    onDeleteView,
    applyFilters,
  } = useSavedViews({
    organizationId,
    entityType: "gabinetPackage",
    systemViews,
  });

  const filteredPackages = useMemo(() => {
    let data: TreatmentPackage[];
    switch (activeViewId) {
      case "active":
        data = (packagesData ?? []).filter((p) => p.isActive);
        break;
      case "inactive":
        data = (packagesData ?? []).filter((p) => !p.isActive);
        break;
      default:
        data = packagesData ?? [];
    }
    if (nudgeFilter === "expiring") {
      data = data.filter((p) => expiringPackageIds.has(p._id));
    }
    if (nudgeFilter === "no-usage") {
      data = data.filter(
        (p) => p.isActive && (activeUsageCounts[p._id] ?? 0) === 0,
      );
    }
    data = applyFilters(data);
    data = applyFilterConditions(data, activeFilters);
    if (searchValue.trim()) {
      const q = searchValue.trim().toLowerCase();
      data = data.filter((p) => p.name.toLowerCase().includes(q));
    }
    return data;
  }, [
    packagesData,
    activeViewId,
    nudgeFilter,
    expiringPackageIds,
    activeUsageCounts,
    applyFilters,
    activeFilters,
    searchValue,
  ]);

  // ---- Columns ----
  const columns: CrmColumn<TreatmentPackage>[] = useMemo(
    () => [
      {
        id: "name",
        label: t("gabinet.packages.name", "Nazwa"),
        sortable: true,
        isRowHeader: true,
        className: "min-w-[200px]",
        render: (item) => (
          <div className="flex items-center gap-2 pl-2 md:pl-0">
            <span className="font-medium text-fg-primary">{item.name}</span>
            {!item.isActive && (
              <Badge variant="outline" className="text-xs text-fg-quaternary">
                {t("common.inactive", "Nieaktywny")}
              </Badge>
            )}
          </div>
        ),
        getSortValue: (item) => item.name,
      },
      {
        id: "totalPrice",
        label: t("gabinet.packages.totalPrice", "Cena"),
        sortable: true,
        className: "min-w-[120px]",
        render: (item) =>
          formatCurrency(item.totalPrice, item.currency ?? undefined),
        getSortValue: (item) => item.totalPrice,
      },
      {
        id: "treatments",
        label: t("gabinet.packages.treatments", "Zabiegi"),
        sortable: true,
        className: "min-w-[100px]",
        render: (item) => {
          const count = item.treatments.length;
          const names = item.treatments
            .map((tr) => treatmentNameMap.get(tr.treatmentId))
            .filter(Boolean)
            .join(", ");
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary">
                    {count} {t("gabinet.packages.treatmentsCount", "zabiegów")}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {names || t("gabinet.packages.treatments", "Zabiegi")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
        getSortValue: (item) => item.treatments.length,
      },
      {
        id: "validityDays",
        label: t("gabinet.packages.validityDays", "Ważność"),
        sortable: true,
        className: "min-w-[100px]",
        render: (item) =>
          item.validityDays
            ? `${item.validityDays} ${t("gabinet.packages.days", "dni")}`
            : "—",
        getSortValue: (item) => item.validityDays ?? 0,
      },
      {
        id: "discountPercent",
        label: t("gabinet.packages.discountPercent", "Rabat"),
        sortable: true,
        className: "min-w-[80px]",
        render: (item) =>
          item.discountPercent ? `${item.discountPercent}%` : "—",
        getSortValue: (item) => item.discountPercent ?? 0,
      },
      {
        id: "activeUses",
        label: t("gabinet.packages.activeUses", "Aktywne użycia"),
        sortable: true,
        className: "min-w-[120px]",
        render: (item) => {
          const count = activeUsageCounts[item._id] ?? 0;
          return count > 0 ? (
            <Badge variant="outline">{count}</Badge>
          ) : (
            <span className="text-fg-quaternary">0</span>
          );
        },
        getSortValue: (item) => activeUsageCounts[item._id] ?? 0,
      },
      {
        id: "usage",
        label: t("gabinet.packages.usageProgress", "Wykorzystanie"),
        sortable: true,
        className: "min-w-[160px]",
        render: (item) => {
          const detail = activeUsageDetails[item._id];
          const progress = detail
            ? Object.values(detail.treatmentProgress)
            : [];
          const overallUsed = progress.reduce((s, p) => s + p.usedCount, 0);
          const overallTotal = progress.reduce((s, p) => s + p.totalCount, 0);
          if (!detail || overallTotal === 0) {
            return <span className="text-fg-quaternary">—</span>;
          }
          const percent = Math.round((overallUsed / overallTotal) * 100);
          const remainingRatio = 1 - overallUsed / overallTotal;
          const barColor =
            remainingRatio <= 0.1
              ? "bg-red-500"
              : remainingRatio < 0.3
                ? "bg-amber-500"
                : "bg-emerald-500";
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-36 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="tabular-nums">
                        {overallUsed} / {overallTotal}
                      </span>
                      <span className="text-fg-quaternary tabular-nums">
                        {percent}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    {item.treatments.map((tr) => {
                      const p = detail.treatmentProgress[tr.treatmentId];
                      const nm =
                        treatmentNameMap.get(tr.treatmentId) ??
                        t("gabinet.packages.treatment", "Zabieg");
                      return (
                        <p key={tr.treatmentId} className="text-xs">
                          {nm}: {p?.usedCount ?? 0} / {p?.totalCount ?? 0}
                        </p>
                      );
                    })}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
        getSortValue: (item) => {
          const detail = activeUsageDetails[item._id];
          if (!detail) return -1;
          const progress = Object.values(detail.treatmentProgress);
          const total = progress.reduce((s, p) => s + p.totalCount, 0);
          if (total === 0) return -1;
          return Math.round(
            (progress.reduce((s, p) => s + p.usedCount, 0) / total) * 100,
          );
        },
      },
      {
        id: "category",
        label: t("common.category", "Kategoria"),
        sortable: true,
        className: "min-w-[140px]",
        render: (item) => {
          if (item.categoryId) {
            const name = categoryNameById.get(item.categoryId);
            if (name) return name;
          }
          return "—";
        },
        getSortValue: (item) =>
          item.categoryId ? (categoryNameById.get(item.categoryId) ?? "") : "",
      },
      {
        id: "isActive",
        label: t("common.active", "Aktywny"),
        render: (item) => (
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              item.isActive ? "bg-green-500" : "bg-gray-300"
            }`}
          />
        ),
      },
    ],
    [
      t,
      treatmentNameMap,
      activeUsageCounts,
      activeUsageDetails,
      categoryNameById,
    ],
  );

  const { allColumns, defaultHidden } = useAllColumns(
    columns,
    filterableFields,
  );
  const { hiddenColumnIds, toggleColumn, setHiddenColumns } =
    useColumnVisibility(defaultHidden, "gabinet-packages");

  // ---- Invalidation ----
  const invalidatePackages = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: supabaseKeys.gabinetTreatmentPackages.list(organizationId),
    });
    void queryClient.invalidateQueries({
      queryKey: supabaseKeys.gabinetPackageUsage.list(organizationId),
    });
  }, [queryClient, organizationId]);

  // ---- Form helpers ----
  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setTotalPrice("");
    setValidityDays("");
    setDiscountPercent("");
    setLoyaltyPoints("");
    setSelectedTreatments([]);
    setTagIds([]);
    setCategoryId(undefined);
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
    setLoyaltyPoints(
      pkg.loyaltyPointsAwarded ? String(pkg.loyaltyPointsAwarded) : "",
    );
    setSelectedTreatments(
      pkg.treatments.map((tr) => ({
        treatmentId: tr.treatmentId,
        quantity: tr.quantity,
      })),
    );
    setTagIds((pkg.tagIds as Id<"tagDefinitions">[]) ?? []);
    setCategoryId(pkg.categoryId as Id<"categoryDefinitions"> | undefined);
    setPanelOpen(true);
  }, []);

  // Entered via "Edytuj" on the package detail card (?edit=<id>) — open the
  // edit panel once data is loaded, then drop the param so refresh/back
  // doesn't reopen it.
  useEffect(() => {
    if (!editParam) return;
    const pkg = (packagesData ?? []).find((p) => p._id === editParam);
    if (!pkg) return;
    openEdit(pkg);
    void navigate({
      to: "/dashboard/gabinet/packages",
      search: { nudge: nudgeFilter, edit: undefined },
      replace: true,
    });
  }, [editParam, packagesData, openEdit, navigate, nudgeFilter]);

  const addTreatmentRow = () => {
    setSelectedTreatments((prev) => [
      ...prev,
      { treatmentId: treatments[0]?._id ?? "", quantity: 1 },
    ]);
  };

  const removeTreatmentRow = (index: number) => {
    setSelectedTreatments((prev) => prev.filter((_, i) => i !== index));
  };

  const updateTreatmentRow = (
    index: number,
    field: "treatmentId" | "quantity",
    value: string | number,
  ) => {
    setSelectedTreatments((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    );
  };

  const handleSubmit = async () => {
    if (!name || !totalPrice || selectedTreatments.length === 0) return;
    if (selectedTreatments.some((t) => !t.treatmentId || t.quantity < 1))
      return;
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
          tagIds: tagIds.length > 0 ? tagIds : null,
          categoryId: categoryId ?? null,
        });
        toast.success(t("common.saved", "Zapisano"));
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
          tagIds: tagIds.length > 0 ? tagIds : null,
          categoryId: categoryId ?? null,
        });
        toast.success(t("gabinet.packages.created", "Pakiet utworzony"));
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
      toast.success(t("common.deleted", "Usunięto"));
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

  const handleToggleActive = useCallback(
    async (pkg: TreatmentPackage) => {
      try {
        await updatePkg({
          organizationId,
          packageId: pkg._id,
          isActive: !pkg.isActive,
        });
        toast.success(
          pkg.isActive
            ? t("gabinet.packages.deactivated", "Pakiet dezaktywowany")
            : t("gabinet.packages.activated", "Pakiet aktywowany"),
        );
        invalidatePackages();
      } catch (e) {
        toast.error(
          formatActionError(e, t, {
            key: "gabinet.packages.errors.toggleActiveFailed",
            defaultValue: "Nie udało się zmienić statusu pakietu.",
          }),
        );
      }
    },
    [updatePkg, organizationId, t, invalidatePackages],
  );

  const handleBulkAction = useCallback(
    async (action: string, selectedRows: TreatmentPackage[]) => {
      if (action === "delete") {
        for (const row of selectedRows) {
          await removePkg({ organizationId, packageId: row._id });
        }
        invalidatePackages();
      }
    },
    [removePkg, organizationId, invalidatePackages],
  );

  const rowActions = useCallback(
    (row: TreatmentPackage) => [
      ...(canEdit
        ? [
            {
              label: t("common.edit", "Edytuj"),
              icon: <Pencil className="h-4 w-4" variant="stroke" />,
              onClick: () => openEdit(row),
            },
            {
              label: row.isActive
                ? t("common.deactivate", "Dezaktywuj")
                : t("common.activate", "Aktywuj"),
              icon: <Power className="h-4 w-4" variant="stroke" />,
              onClick: () => handleToggleActive(row),
            },
          ]
        : []),
      ...(canDelete
        ? [
            {
              label: t("common.delete", "Usuń"),
              icon: <Trash2 className="h-4 w-4" variant="stroke" />,
              onClick: () => confirmDelete(row._id),
            },
          ]
        : []),
    ],
    [t, canEdit, canDelete, openEdit, handleToggleActive],
  );

  const handleAssignGift = async () => {
    if (!assigningGiftId || !assignPatientId) return;
    setAssignSubmitting(true);
    try {
      await assignGift({
        organizationId,
        usageId: assigningGiftId,
        patientId: assignPatientId,
      });
      toast.success(
        t("gabinet.packages.giftAssigned", "Voucher przypisany do pacjenta."),
      );
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.gabinetPackageUsage.list(organizationId),
      });
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
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.gabinetPatients.list(organizationId),
      });
      setCreatePatientPanelOpen(false);
      toast.success(
        t("gabinet.patients.created", { defaultValue: "Klient utworzony" }),
      );
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
    const usages = unassignedUsagesData ?? [];
    if (!giftSearch.trim()) return usages;
    const q = giftSearch.toLowerCase();
    return usages.filter(
      (u) =>
        (u.voucherCode ?? "").toLowerCase().includes(q) ||
        (u.giftRecipientName ?? "").toLowerCase().includes(q) ||
        (u.giftRecipientPhone ?? "").toLowerCase().includes(q) ||
        (u.giftRecipientEmail ?? "").toLowerCase().includes(q),
    );
  }, [unassignedUsagesData, giftSearch]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("gabinet.packages.title", "Pakiety")}
        description={t(
          "gabinet.packages.description",
          "Zarządzaj pakietami zabiegów",
        )}
        actions={
          <PermissionGate feature="gabinet_packages" action="create">
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              {t("gabinet.packages.addPackage", "Dodaj pakiet")}
            </Button>
          </PermissionGate>
        }
      />

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
            {t("common.clearFilters", "Wyczyść filtry")}
          </Button>
        </div>
      )}

      <DataListFilterBar
        views={views}
        activeViewId={activeViewId}
        onViewChange={onViewChange}
        onCreateView={onCreateView}
        onDeleteView={onDeleteView}
        filterableFields={filterableFields}
        filterSlideoutOpen={filterSlideoutOpen}
        onFilterSlideoutOpenChange={setFilterSlideoutOpen}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder={t(
          "gabinet.packages.searchPlaceholder",
          "Szukaj pakietów...",
        )}
        columnDefs={allColumns.map((c) => ({
          id: c.id,
          label: c.label ?? c.id,
        }))}
        hiddenColumnIds={hiddenColumnIds}
        onToggleColumn={toggleColumn}
        onSetHiddenColumns={setHiddenColumns}
        onTagsManage={() => setTagsSlideoutOpen(true)}
        onCategoriesManage={() => setCategoriesSlideoutOpen(true)}
        onFiltersChange={setActiveFilters}
      />

      {/* Mobile-only KPI toggle */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setShowStatsMobile((s) => !s)}
        aria-expanded={showStatsMobile}
        className="md:hidden w-full justify-between"
      >
        {showStatsMobile
          ? t("common.hideStats", "Ukryj statystyki")
          : t("common.showStats", "Pokaż statystyki")}
        {showStatsMobile ? (
          <ChevronUp className="size-4" />
        ) : (
          <ChevronDown className="size-4" />
        )}
      </Button>

      {/* KPI Statistics Cards */}
      <div
        className={`${showStatsMobile ? "grid" : "hidden md:grid"} gap-4 sm:grid-cols-3`}
      >
        <StatisticsOrderCard
          title={t("gabinet.packages.totalPackages", "Pakiety")}
          description={t("gabinet.packages.inCatalog", "W ofercie")}
          value={String(pkgKpis.totalPackages)}
          changePercentage={`${pkgKpis.activePackages} ${t("gabinet.packages.active", "aktywnych")}`}
        />
        <StatisticsProfitCard
          title={t("gabinet.packages.activePackages", "Aktywne wykupione")}
          description={t("gabinet.packages.inUse", "W użyciu")}
          value={String(activeUsagesData?.length ?? 0)}
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
            {(unassignedUsagesData?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {unassignedUsagesData!.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-4">
          <CrmDataTable
            columns={allColumns}
            data={filteredPackages}
            isLoading={isLoading}
            hiddenColumnIds={hiddenColumnIds}
            sortDescriptor={sortDescriptor}
            onSortChange={setSortDescriptor}
            enableBulkSelect
            bulkActions={[
              {
                label: t("common.delete", "Usuń"),
                value: "delete",
                variant: "destructive",
              },
            ]}
            onBulkAction={handleBulkAction}
            onRowAction={(rowId) =>
              navigate({ to: `/dashboard/gabinet/packages/${rowId}` })
            }
            rowActions={rowActions}
            emptyTitle={t("gabinet.packages.emptyTitle", "Brak pakietów")}
            emptyDescription={t(
              "gabinet.packages.emptyDescription",
              "Utwórz pierwszy pakiet zabiegów.",
            )}
          />
        </TabsContent>

        <TabsContent value="gifts" className="mt-4 space-y-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              variant="stroke"
            />
            <Input
              className="pl-9"
              placeholder={t(
                "gabinet.packages.giftSearch",
                "Szukaj po kodzie vouchera, nazwisku lub e-mailu...",
              )}
              value={giftSearch}
              onChange={(e) => setGiftSearch(e.target.value)}
            />
          </div>

          {filteredGiftPackages.length === 0 ? (
            <EmptyState
              icon={Gift}
              title={t(
                "gabinet.packages.giftEmptyTitle",
                "Brak nieprzypisanych voucherów",
              )}
              description={t(
                "gabinet.packages.giftEmptyDescription",
                "Sprzedane vouchery podarunkowe, które nie zostały jeszcze przypisane do pacjenta, pojawią się tutaj.",
              )}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredGiftPackages.map((usage) => {
                const pkg = (packagesData ?? []).find(
                  (p) => p._id === usage.packageId,
                );
                return (
                  <div
                    key={usage._id}
                    className="rounded-lg border p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-medium truncate">
                          {pkg?.name ??
                            t(
                              "gabinet.packages.unknownPackage",
                              "Nieznany pakiet",
                            )}
                        </h3>
                        {usage.voucherCode && (
                          <p className="text-sm font-mono text-muted-foreground">
                            {usage.voucherCode}
                          </p>
                        )}
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {t("gabinet.packages.unassigned", "Nieprzypisany")}
                      </Badge>
                    </div>

                    {(usage.giftRecipientName ||
                      usage.giftRecipientPhone ||
                      usage.giftRecipientEmail) && (
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        {usage.giftRecipientName && (
                          <p>{usage.giftRecipientName}</p>
                        )}
                        {usage.giftRecipientPhone && (
                          <p>{usage.giftRecipientPhone}</p>
                        )}
                        {usage.giftRecipientEmail && (
                          <p>{usage.giftRecipientEmail}</p>
                        )}
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                      {t("gabinet.packages.purchasedAt", "Zakupiono")}:{" "}
                      {new Date(usage.purchasedAt).toLocaleDateString("pl-PL")}
                      {usage.expiresAt && (
                        <>
                          {" "}
                          · {t("gabinet.packages.expiresAt", "Ważny do")}:{" "}
                          {new Date(usage.expiresAt).toLocaleDateString(
                            "pl-PL",
                          )}
                        </>
                      )}
                    </div>

                    <div className="text-sm font-semibold">
                      {usage.paidAmount} PLN
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setAssigningGiftId(usage._id);
                        setAssignPatientId("");
                      }}
                    >
                      <Gift className="mr-1.5 h-4 w-4" variant="stroke" />
                      {t(
                        "gabinet.packages.assignToPatient",
                        "Przypisz do pacjenta",
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Package create/edit panel */}
      <SidePanel
        open={panelOpen}
        onOpenChange={(open) => {
          setPanelOpen(open);
          if (!open) resetForm();
        }}
        title={
          editingId
            ? t("gabinet.packages.editPackage", "Edytuj pakiet")
            : t("gabinet.packages.addPackage", "Dodaj pakiet")
        }
        onSubmit={handleSubmit}
        isSubmitting={submitting}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("gabinet.packages.name", "Nazwa")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("gabinet.packages.descriptionField", "Opis")}</Label>
            <RichTextEditor
              value={description}
              onChange={(val) => setDescription(val ?? "")}
              minHeight="80px"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("gabinet.packages.totalPrice", "Cena")}</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={totalPrice}
                onChange={(e) => setTotalPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                {t("gabinet.packages.validityDays", "Ważność (dni)")}
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                {t("gabinet.packages.discountPercent", "Rabat (%)")}
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                {t("gabinet.packages.loyaltyPoints", "Punkty lojalnościowe")}
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                value={loyaltyPoints}
                onChange={(e) => setLoyaltyPoints(e.target.value)}
              />
            </div>
          </div>

          {/* Category picker */}
          <div className="space-y-1.5">
            <Label>{t("common.category", "Kategoria")}</Label>
            <CategoryPicker
              categories={categories}
              selectedId={categoryId}
              onChange={setCategoryId}
              organizationId={organizationId}
              entityType="gabinetPackage"
            />
          </div>

          {/* Tags picker */}
          {tags.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t("common.tags", "Tagi")}</Label>
              <TagsPicker
                tags={tags}
                selectedIds={tagIds}
                onChange={setTagIds}
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                {t(
                  "gabinet.packages.treatmentsInPackage",
                  "Zabiegi w pakiecie",
                )}
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addTreatmentRow}
              >
                <Plus className="mr-1 h-4 w-4" variant="stroke" />{" "}
                {t("common.add", "Dodaj")}
              </Button>
            </div>
            {selectedTreatments.length === 0 && (
              <p className="text-sm text-muted-foreground py-1">
                {t("gabinet.packages.noTreatments", "Brak zabiegów")}
              </p>
            )}
            {selectedTreatments.map((st, i) => (
              <div key={i} className="rounded-md border p-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("gabinet.packages.treatment", "Zabieg")}
                    </Label>
                    <Select
                      value={st.treatmentId}
                      onValueChange={(val) =>
                        updateTreatmentRow(i, "treatmentId", val)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t(
                            "gabinet.packages.treatment",
                            "Zabieg",
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {treatments.length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            {t(
                              "gabinet.packages.noTreatmentsAvailable",
                              "Brak dostępnych zabiegów",
                            )}
                          </SelectItem>
                        ) : (
                          treatments.map((tr) => (
                            <SelectItem key={tr._id} value={tr._id}>
                              {tr.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24 shrink-0 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("gabinet.packages.quantity", "Ilość")}
                    </Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={st.quantity}
                      onChange={(e) =>
                        updateTreatmentRow(
                          i,
                          "quantity",
                          parseInt(e.target.value) || 1,
                        )
                      }
                      min={1}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => removeTreatmentRow(i)}
                    aria-label={t("common.delete", "Usuń")}
                  >
                    <Trash2 className="h-4 w-4" variant="stroke" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SidePanel>

      <SellPackagePanel
        organizationId={organizationId}
        open={assignPanelOpen}
        onOpenChange={setAssignPanelOpen}
      />

      {/* Gift assignment panel */}
      <SidePanel
        open={assigningGiftId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAssigningGiftId(null);
            setAssignPatientId("");
          }
        }}
        title={t(
          "gabinet.packages.assignGiftTitle",
          "Przypisz voucher do pacjenta",
        )}
        onSubmit={handleAssignGift}
        isSubmitting={assignSubmitting}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t(
              "gabinet.packages.assignGiftDescription",
              "Wybierz pacjenta, do którego zostanie przypisany voucher. Pakiet stanie się aktywny dla wybranego pacjenta.",
            )}
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
                <SelectValue
                  placeholder={t(
                    "gabinet.packages.selectPatient",
                    "Wybierz pacjenta...",
                  )}
                />
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

      {/* New patient creation panel */}
      <SidePanel
        open={createPatientPanelOpen}
        onOpenChange={setCreatePatientPanelOpen}
        title={t("gabinet.patients.createPatient", "Nowy pacjent")}
        description={t(
          "gabinet.patients.createDescription",
          "Wypełnij dane nowego pacjenta.",
        )}
      >
        <PatientForm
          onSubmit={handleCreatePatient}
          onCancel={() => setCreatePatientPanelOpen(false)}
          isSubmitting={creatingPatient}
          organizationId={organizationId}
        />
      </SidePanel>

      <TagsManagerSlideout
        isOpen={tagsSlideoutOpen}
        onOpenChange={setTagsSlideoutOpen}
        organizationId={organizationId}
        tags={tags}
      />
      <CategoriesManagerSlideout
        isOpen={categoriesSlideoutOpen}
        onOpenChange={setCategoriesSlideoutOpen}
        organizationId={organizationId}
        entityType="gabinetPackage"
        categories={categories}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("common.confirmDelete", "Potwierdź usunięcie")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "gabinet.packages.confirmDeleteDescription",
                "Tej operacji nie można cofnąć.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("common.cancel", "Anuluj")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete", "Usuń")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
