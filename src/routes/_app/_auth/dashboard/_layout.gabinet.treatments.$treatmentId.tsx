import { useState, useMemo, useCallback, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseGabinetTreatment, useSupabaseGabinetTreatmentVariants } from "@/hooks/use-supabase-gabinet-treatments";
import { useSupabaseActivitiesByEntity } from "@/hooks/use-supabase-activities";
import { useSupabaseGabinetEmployeesList } from "@/hooks/use-supabase-gabinet-employees";
import { useSupabaseGabinetEquipmentList } from "@/hooks/use-supabase-gabinet-equipment";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { SidePanel } from "@/components/crm/side-panel";
import { TreatmentForm } from "@/components/gabinet/treatment-form";
import type { TreatmentFormData } from "@/components/gabinet/treatment-form";
import {
  EntityDetailLayout,
  type DetailField,
} from "@/components/crm/entity-detail-layout";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";
import { EntityDocumentsTab } from "@/components/documents/entity-documents-tab";
import { TreatmentRequiredDocuments } from "@/components/documents/treatment-required-documents";
import type { RequiredFormTemplate } from "@/components/documents/treatment-required-documents";
import { Separator } from "@/components/ui/separator";
import { ActivityFeed } from "@/components/crm/activity-feed";
import { activitiesToFeedEntries } from "@/components/crm/activity-feed-adapter";
import { TreatmentOverviewStats } from "@/components/gabinet/treatment-overview-stats";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  Calendar,
  Clock,
  DollarSign,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  X,
} from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/treatments/$treatmentId",
)({
  component: TreatmentDetail,
});

function formatCurrency(amount: number, currency?: string): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: currency ?? "PLN",
  }).format(amount);
}

const APPOINTMENT_STATUSES = [
  "pending_confirmation",
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;

type TreatmentParam = {
  name: string;
  type: string;
  description?: string;
  unit?: string;
  options?: string[];
  isRequired?: boolean;
};

function TreatmentDetail() {
  const { treatmentId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // State
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Parameters tab state
  type ParamType = "text" | "number" | "checkbox" | "radio" | "select";
  const [editingParam, setEditingParam] = useState<{
    name: string;
    type: ParamType;
    description: string;
    unit: string;
    options: string[];
    isRequired: boolean;
  } | null>(null);
  const [newOption, setNewOption] = useState("");

  // Employees tab state
  const [empSearchQuery, setEmpSearchQuery] = useState("");

  // Appointments tab filters
  const [aptStatusFilter, setAptStatusFilter] = useState<string>("all");
  const [aptDateFrom, setAptDateFrom] = useState("");
  const [aptDateTo, setAptDateTo] = useState("");

  // Variants tab state
  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<string | null>(null);
  const [variantForm, setVariantForm] = useState({
    name: "",
    price: "" as string,
    duration: "" as string,
    description: "",
    shortDescription: "",
    isActive: true,
    overridePrice: false,
    overrideDuration: false,
    overrideDescription: false,
    overrideShortDescription: false,
  });

  // Mutations
  const updateTreatment = useAction(api.gabinet.treatments.update);
  const removeTreatment = useAction(api.gabinet.treatments.remove);
  const saveTreatmentParameters = useAction(api.gabinet.treatments.saveTreatmentParameters);
  const setQualifiedTreatments = useAction(api.gabinet.employees.setQualifiedTreatments);
  const createVariantMut = useAction(api.gabinet.treatments.createVariant);
  const updateVariantMut = useAction(api.gabinet.treatments.updateVariant);
  const deleteVariantMut = useAction(api.gabinet.treatments.deleteVariant);
  const trackView = useAction(api.recentlyViewed.track);
  const queryClient = useQueryClient();

  // Queries — treatment detail + variants from Supabase
  const { data: treatment, isLoading } = useSupabaseGabinetTreatment(
    organizationId,
    treatmentId,
  );

  const getDetailedStatsAction = useAction(api.gabinet.treatments.getTreatmentDetailedStats);
  const listTreatmentAppointmentsAction = useAction(api.gabinet.treatments.listTreatmentAppointments);
  const getTreatmentEmployeesAction = useAction(api.gabinet.treatments.getTreatmentEmployees);

  const { data: detailedStats } = useQuery({
    queryKey: ["gabinet.treatments.getTreatmentDetailedStats", organizationId, treatmentId],
    queryFn: () =>
      getDetailedStatsAction({
        organizationId,
        treatmentId: treatmentId as string,
      }),
    enabled: !!organizationId && !!treatmentId,
  });

  const { data: treatmentAppointments } = useQuery({
    queryKey: [
      "gabinet.treatments.listTreatmentAppointments",
      organizationId,
      treatmentId,
      aptStatusFilter,
      aptDateFrom,
      aptDateTo,
    ],
    queryFn: () =>
      listTreatmentAppointmentsAction({
        organizationId,
        treatmentId: treatmentId as string,
        status: aptStatusFilter !== "all" ? aptStatusFilter : undefined,
        dateFrom: aptDateFrom || undefined,
        dateTo: aptDateTo || undefined,
      }),
    enabled: !!organizationId && !!treatmentId,
  });

  const { data: treatmentEmployees } = useQuery({
    queryKey: ["gabinet.treatments.getTreatmentEmployees", organizationId, treatmentId],
    queryFn: () =>
      getTreatmentEmployeesAction({
        organizationId,
        treatmentId: treatmentId as string,
      }),
    enabled: !!organizationId && !!treatmentId,
  });

  const { data: rawVariants } = useSupabaseGabinetTreatmentVariants(
    organizationId,
    treatmentId,
  );

  // Enrich variants with resolved/inherited fields (previously computed server-side in Convex)
  const variants = useMemo(() => {
    if (!rawVariants) return undefined;
    return rawVariants.map((v) => ({
      ...v,
      resolvedPrice: v.price ?? (treatment?.price ?? 0),
      resolvedDuration: v.duration ?? (treatment?.duration ?? 0),
      resolvedShortDescription: v.shortDescription ?? (treatment?.shortDescription ?? undefined),
      priceInherited: v.price == null,
      durationInherited: v.duration == null,
      descriptionInherited: v.description == null,
      shortDescriptionInherited: v.shortDescription == null,
    }));
  }, [rawVariants, treatment?.price, treatment?.duration, treatment?.shortDescription]);

  // Activities for the new Activity tab
  const { data: activities } = useSupabaseActivitiesByEntity(
    organizationId,
    "gabinetTreatment",
    treatmentId,
  );

  // All org employees for the assign picker
  const { data: allGabinetEmployees } = useSupabaseGabinetEmployeesList(organizationId);

  const allEmps = allGabinetEmployees ?? [];

  // Equipment list for resolving IDs to names
  const { data: equipmentList } = useSupabaseGabinetEquipmentList(organizationId);

  const getEquipmentName = (id: Id<"gabinetEquipment">) =>
    equipmentList?.find((e) => e._id === id)?.name ?? id;

  // Track recently viewed
  useEffect(() => {
    if (treatment && organizationId) {
      trackView({ organizationId, entityType: "gabinetTreatments", entityId: treatment._id, entityLabel: treatment.name });
    }
  }, [treatment?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Collapse app sidebar to icon-only so EntityDetailLayout sidebar has room
  const { setShellSidebarMode } = useSidebarSlot();
  useEffect(() => {
    setShellSidebarMode("icon-only");
    return () => setShellSidebarMode("default");
  }, [setShellSidebarMode]);

  // Build fields for EntityDetailLayout sidebar
  const detailFields: DetailField[] = useMemo(() => {
    if (!treatment) return [];
    const fields: DetailField[] = [
      { label: t("gabinet.treatments.price"), value: formatCurrency(treatment.price, treatment.currency ?? undefined), fieldKey: "price" },
      { label: t("gabinet.treatments.duration"), value: `${treatment.duration} min`, fieldKey: "duration" },
      { label: t("gabinet.treatments.category"), value: treatment.category ?? "—", fieldKey: "category" },
    ];
    if (treatment.taxRate != null) {
      fields.push({ label: t("gabinet.treatments.taxRate"), value: `${treatment.taxRate}%`, fieldKey: "taxRate" });
    }
    if (treatment.requiredEquipmentIds?.length || treatment.requiredEquipment?.length) {
      const equipmentNames = treatment.requiredEquipmentIds?.length
        ? treatment.requiredEquipmentIds.map((id: string) => getEquipmentName(id as Id<"gabinetEquipment">)).join(", ")
        : (treatment.requiredEquipment ?? []).join(", ");
      fields.push({ label: t("gabinet.treatments.requiredEquipment"), value: equipmentNames, fieldKey: "equipment" });
    }
    if (treatment.requiresApproval) {
      fields.push({ label: t("gabinet.treatments.requiresApproval"), value: <Badge variant="outline" className="text-[10px]">{t("common.yes")}</Badge>, fieldKey: "approval" });
    }
    if (treatment.treatmentCount && treatment.treatmentCount > 1) {
      fields.push({ label: t("gabinet.treatments.treatmentCount", "Liczba zabiegów"), value: <Badge variant="outline" className="text-[10px]">{treatment.treatmentCount}x</Badge>, fieldKey: "count" });
    }
    return fields;
  }, [treatment, equipmentList, t]);

  // Derived: unassigned employees (those that don't have this treatment in qualifiedTreatmentIds)
  const assignedEmployeeIds = useMemo(() => {
    return new Set((treatmentEmployees ?? []).map((e) => e._id));
  }, [treatmentEmployees]);

  const unassignedEmployees = useMemo(() => {
    const filtered = allEmps.filter(
      (emp) => emp.isActive && !assignedEmployeeIds.has(emp._id),
    );
    if (!empSearchQuery) return filtered;
    const q = empSearchQuery.toLowerCase();
    return filtered.filter((emp) => {
      const name = `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim().toLowerCase();
      return name.includes(q);
    });
  }, [allEmps, assignedEmployeeIds, empSearchQuery]);

  // Recent appointments for overview (last 10)
  const recentAppointments = useMemo(() => {
    if (!treatmentAppointments) return [];
    return treatmentAppointments.slice(0, 10);
  }, [treatmentAppointments]);

  // --- Variant handlers (hooks must be before early returns) ---

  const resetVariantForm = useCallback(() => {
    setVariantForm({
      name: "",
      price: "",
      duration: "",
      description: "",
      shortDescription: "",
      isActive: true,
      overridePrice: false,
      overrideDuration: false,
      overrideDescription: false,
      overrideShortDescription: false,
    });
    setEditingVariant(null);
  }, []);

  const openCreateVariantDialog = useCallback(() => {
    resetVariantForm();
    setVariantDialogOpen(true);
  }, [resetVariantForm]);

  const openEditVariantDialog = useCallback(
    (variant: NonNullable<typeof variants>[number]) => {
      setEditingVariant(variant._id);
      setVariantForm({
        name: variant.name,
        price: variant.price !== undefined ? String(variant.price) : "",
        duration: variant.duration !== undefined ? String(variant.duration) : "",
        description: variant.description ?? "",
        shortDescription: variant.shortDescription ?? "",
        isActive: variant.isActive ?? true,
        overridePrice: !variant.priceInherited,
        overrideDuration: !variant.durationInherited,
        overrideDescription: !variant.descriptionInherited,
        overrideShortDescription: !variant.shortDescriptionInherited,
      });
      setVariantDialogOpen(true);
    },
    [],
  );

  // --- Handlers (after hooks, before render) ---

  const handleDeactivate = async () => {
    if (window.confirm(t("gabinet.treatments.confirmDelete"))) {
      await removeTreatment({
        organizationId,
        treatmentId: treatmentId as Id<"gabinetTreatments">,
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetTreatments.list(organizationId) });
      navigate({ to: "/dashboard/gabinet/treatments" });
    }
  };

  const handleEditSubmit = async (formData: TreatmentFormData) => {
    setIsSubmitting(true);
    try {
      await updateTreatment({
        organizationId,
        treatmentId: treatmentId as Id<"gabinetTreatments">,
        ...formData,
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetTreatments.detail(organizationId, treatmentId) });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetTreatments.list(organizationId) });
      setEditPanelOpen(false);
      toast.success(t("common.saved"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddParameter = async () => {
    if (!editingParam || !editingParam.name.trim()) return;
    const needsOptions = ["checkbox", "radio", "select"].includes(editingParam.type);
    if (needsOptions && editingParam.options.length === 0) {
      toast.error(t("gabinet.treatmentDetail.optionsRequired"));
      return;
    }
    const currentParams = (treatment!.parameters as TreatmentParam[] | undefined) ?? [];
    const newParam = {
      name: editingParam.name.trim(),
      type: editingParam.type,
      description: editingParam.description.trim() || undefined,
      unit: ["text", "number"].includes(editingParam.type) ? (editingParam.unit.trim() || undefined) : undefined,
      options: needsOptions ? editingParam.options : undefined,
      isRequired: editingParam.isRequired || undefined,
    };
    await saveTreatmentParameters({
      organizationId,
      treatmentId: treatmentId as Id<"gabinetTreatments">,
      parameters: [...currentParams, newParam] as any,
    });
    setEditingParam(null);
    setNewOption("");
    toast.success(t("common.saved"));
  };

  const handleRemoveParameter = async (index: number) => {
    const currentParams = (treatment!.parameters as TreatmentParam[] | undefined) ?? [];
    const newParams = currentParams.filter((_, i) => i !== index);
    await saveTreatmentParameters({
      organizationId,
      treatmentId: treatmentId as Id<"gabinetTreatments">,
      parameters: newParams as any,
    });
    toast.success(t("common.saved"));
  };

  const handleAssignEmployee = async (employeeId: string) => {
    const emp = allEmps.find((e) => e._id === employeeId);
    if (!emp) return;
    const updated = [...emp.qualifiedTreatmentIds, treatmentId as Id<"gabinetTreatments">];
    await setQualifiedTreatments({
      organizationId,
      employeeId: employeeId as Id<"gabinetEmployees">,
      treatmentIds: updated,
    });
    setEmpSearchQuery("");
    toast.success(t("common.saved"));
  };

  const handleUnassignEmployee = async (employeeId: string) => {
    const emp = allEmps.find((e) => e._id === employeeId);
    if (!emp) return;
    const updated = emp.qualifiedTreatmentIds.filter((id) => id !== treatmentId);
    await setQualifiedTreatments({
      organizationId,
      employeeId: employeeId as Id<"gabinetEmployees">,
      treatmentIds: updated as Id<"gabinetTreatments">[],
    });
    toast.success(t("common.saved"));
  };

  const handleSaveVariant = async () => {
    if (!variantForm.name.trim()) return;
    setIsSubmitting(true);
    try {
      if (editingVariant) {
        await updateVariantMut({
          organizationId,
          variantId: editingVariant as Id<"gabinetTreatmentVariants">,
          name: variantForm.name,
          ...(variantForm.overridePrice
            ? { price: parseFloat(variantForm.price) || 0 }
            : { clearPrice: true }),
          ...(variantForm.overrideDuration
            ? { duration: parseInt(variantForm.duration) || 0 }
            : { clearDuration: true }),
          ...(variantForm.overrideDescription
            ? { description: variantForm.description || undefined }
            : { clearDescription: true }),
          ...(variantForm.overrideShortDescription
            ? { shortDescription: variantForm.shortDescription || undefined }
            : { clearShortDescription: true }),
          isActive: variantForm.isActive,
        });
        toast.success(t("gabinet.treatmentDetail.variants.saved"));
      } else {
        await createVariantMut({
          organizationId,
          treatmentId: treatmentId as Id<"gabinetTreatments">,
          name: variantForm.name,
          ...(variantForm.overridePrice
            ? { price: parseFloat(variantForm.price) || 0 }
            : {}),
          ...(variantForm.overrideDuration
            ? { duration: parseInt(variantForm.duration) || 0 }
            : {}),
          ...(variantForm.overrideDescription && variantForm.description
            ? { description: variantForm.description }
            : {}),
          ...(variantForm.overrideShortDescription && variantForm.shortDescription
            ? { shortDescription: variantForm.shortDescription }
            : {}),
          isActive: variantForm.isActive,
        });
        toast.success(t("gabinet.treatmentDetail.variants.created"));
      }
      setVariantDialogOpen(false);
      resetVariantForm();
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetTreatmentVariants.list(organizationId) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteVariant = async (variantId: string) => {
    if (!window.confirm(t("gabinet.treatmentDetail.variants.confirmDelete"))) return;
    await deleteVariantMut({
      organizationId,
      variantId: variantId as Id<"gabinetTreatmentVariants">,
    });
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetTreatmentVariants.list(organizationId) });
    toast.success(t("gabinet.treatmentDetail.variants.deleted"));
  };

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "default";
      case "cancelled":
      case "no_show":
        return "destructive";
      case "confirmed":
        return "secondary";
      default:
        return "outline";
    }
  };

  // (sidebar fields and stats are rendered inline in the sidebar below)

  // --- Build tabs ---
  const tabs = useMemo(() => {
    if (!treatment) return [];
    return [
      {
        label: t("gabinet.treatmentDetail.tabs.overview"),
        content: detailedStats ? (
          <TreatmentOverviewStats
            stats={detailedStats}
            recentAppointments={recentAppointments}
            currency={treatment.currency ?? undefined}
            treatmentName={treatment.name}
          />
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t("common.loading", "Ładowanie...")}
          </div>
        ),
      },
      {
        label: t("gabinet.treatmentDetail.tabs.parameters"),
        content: (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    {t("gabinet.treatmentDetail.treatmentParameters")}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.treatmentDetail.parametersDescription")}
                </p>

                {/* Existing parameters list */}
                {((treatment.parameters as TreatmentParam[] | undefined) ?? []).length > 0 ? (
                  <div className="space-y-2">
                    {((treatment.parameters as TreatmentParam[] | undefined) ?? []).map((param, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {(t as any)(`gabinet.treatmentDetail.parameterTypes.${param.type}`, param.type)}
                            </Badge>
                            <span className="text-sm font-medium">{param.name}</span>
                            {param.unit && (
                              <span className="text-xs text-muted-foreground">({param.unit})</span>
                            )}
                            {param.isRequired && (
                              <span className="text-xs text-destructive">*</span>
                            )}
                          </div>
                          {param.description && (
                            <span className="text-xs text-muted-foreground">{param.description}</span>
                          )}
                          {param.options && param.options.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {param.options.map((opt, oi) => (
                                <Badge key={oi} variant="outline" className="text-xs font-normal">
                                  {opt}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive shrink-0"
                          onClick={() => handleRemoveParameter(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" variant="stroke" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    {t("gabinet.treatmentDetail.noParameters")}
                  </p>
                )}

                {/* Add parameter form */}
                {editingParam ? (
                  <div className="rounded-md border p-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("gabinet.treatmentDetail.parameterName")} *</Label>
                        <Input
                          value={editingParam.name}
                          onChange={(e) => setEditingParam({ ...editingParam, name: e.target.value })}
                          placeholder={t("gabinet.treatmentDetail.parameterNamePlaceholder")}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("gabinet.treatmentDetail.parameterType")}</Label>
                        <Select
                          value={editingParam.type}
                          onValueChange={(val) => setEditingParam({ ...editingParam, type: val as ParamType, options: [] })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(["text", "number", "checkbox", "radio", "select"] as const).map((pt) => (
                              <SelectItem key={pt} value={pt}>
                                {t(`gabinet.treatmentDetail.parameterTypes.${pt}`, pt)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {["text", "number"].includes(editingParam.type) && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("gabinet.treatmentDetail.parameterUnit")}</Label>
                        <Input
                          value={editingParam.unit}
                          onChange={(e) => setEditingParam({ ...editingParam, unit: e.target.value })}
                          placeholder="°C, ml, mm..."
                          className="w-40"
                        />
                      </div>
                    )}

                    {["checkbox", "radio", "select"].includes(editingParam.type) && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("gabinet.treatmentDetail.parameterOptions")} *</Label>
                        <div className="space-y-2">
                          {editingParam.options.map((opt, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="flex-1 text-sm">{opt}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() =>
                                  setEditingParam({
                                    ...editingParam,
                                    options: editingParam.options.filter((_, idx2) => idx2 !== i),
                                  })
                                }
                              >
                                <X className="h-4 w-4" variant="stroke" />
                              </Button>
                            </div>
                          ))}
                          <div className="flex items-center gap-2">
                            <Input
                              value={newOption}
                              onChange={(e) => setNewOption(e.target.value)}
                              placeholder={t("gabinet.treatmentDetail.addOption")}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && newOption.trim()) {
                                  e.preventDefault();
                                  setEditingParam({
                                    ...editingParam,
                                    options: [...editingParam.options, newOption.trim()],
                                  });
                                  setNewOption("");
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 shrink-0"
                              onClick={() => {
                                if (newOption.trim()) {
                                  setEditingParam({
                                    ...editingParam,
                                    options: [...editingParam.options, newOption.trim()],
                                  });
                                  setNewOption("");
                                }
                              }}
                            >
                              <Plus className="h-4 w-4" variant="stroke" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("gabinet.treatmentDetail.parameterDescription")}</Label>
                      <Input
                        value={editingParam.description}
                        onChange={(e) => setEditingParam({ ...editingParam, description: e.target.value })}
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editingParam.isRequired}
                          onChange={(e) => setEditingParam({ ...editingParam, isRequired: e.target.checked })}
                          className="rounded border-input"
                        />
                        {t("common.required", "Wymagane")}
                      </label>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setEditingParam(null); setNewOption(""); }}
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleAddParameter}
                          disabled={!editingParam.name.trim()}
                        >
                          {t("common.add")}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setEditingParam({
                        name: "",
                        type: "text",
                        description: "",
                        unit: "",
                        options: [],
                        isRequired: false,
                      })
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" variant="stroke" />
                    {t("gabinet.treatmentDetail.addParameter")}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        ),
      },
      {
        label: t("gabinet.treatmentDetail.tabs.documents"),
        content: (
          <div className="space-y-6">
            <TreatmentRequiredDocuments
              treatmentId={treatmentId as Id<"gabinetTreatments">}
              organizationId={organizationId}
              requiredFormTemplates={
                (treatment?.requiredFormTemplates as RequiredFormTemplate[] | undefined) ?? []
              }
            />
            <Separator />
            <EntityDocumentsTab
              entityType="treatment"
              entityId={treatmentId}
              organizationId={organizationId}
            />
          </div>
        ),
      },
      {
        label: t("gabinet.treatmentDetail.tabs.employees"),
        count: (treatmentEmployees ?? []).length,
        content: (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  {t("gabinet.treatmentDetail.assignedEmployees")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.treatmentDetail.employeesDescription")}
                </p>

                {/* Assigned employees */}
                {(treatmentEmployees ?? []).length > 0 ? (
                  <div className="space-y-2">
                    {(treatmentEmployees ?? []).map((emp) => (
                      <div
                        key={emp._id}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {(emp.firstName?.[0] ?? "") + (emp.lastName?.[0] ?? "")}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <span className="text-sm font-medium">
                              {`${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() || emp.userName}
                            </span>
                            {emp.specialization && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {emp.specialization}
                              </span>
                            )}
                          </div>
                          <Badge variant={emp.isActive ? "default" : "secondary"} className="text-xs">
                            {t(`gabinet.employees.roles.${emp.role}`)}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleUnassignEmployee(emp._id)}
                        >
                          <X className="h-3.5 w-3.5" variant="stroke" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2 text-center">
                    {t("gabinet.treatmentDetail.noEmployees")}
                  </p>
                )}

                {/* Add employee */}
                <div className="border-t pt-4 space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("gabinet.treatmentDetail.addEmployee")}
                  </label>
                  <Input
                    value={empSearchQuery}
                    onChange={(e) => setEmpSearchQuery(e.target.value)}
                    placeholder={t("gabinet.treatmentDetail.searchEmployees")}
                    className="mb-2"
                  />
                  {unassignedEmployees.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {unassignedEmployees.map((emp) => (
                        <div
                          key={emp._id}
                          className="flex items-center justify-between rounded-md p-2 hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => handleAssignEmployee(emp._id)}
                        >
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs bg-muted">
                                {(emp.firstName?.[0] ?? "") + (emp.lastName?.[0] ?? "")}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">
                              {`${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim()}
                            </span>
                          </div>
                          <Plus className="h-3.5 w-3.5 text-muted-foreground" variant="stroke" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ),
      },
      {
        label: t("gabinet.treatmentDetail.tabs.variants"),
        count: (variants ?? []).length,
        content: (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    {t("gabinet.treatmentDetail.variants.title")}
                  </CardTitle>
                  <Button size="sm" onClick={openCreateVariantDialog}>
                    <Plus className="h-4 w-4 mr-1" variant="stroke" />
                    {t("gabinet.treatmentDetail.variants.addVariant")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.treatmentDetail.variants.description")}
                </p>

                {(variants ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    {t("gabinet.treatmentDetail.variants.noVariants")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(variants ?? []).map((variant) => (
                      <div
                        key={variant._id}
                        className="flex items-center justify-between rounded-md border p-4"
                      >
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{variant.name}</span>
                            <Badge
                              variant={(variant.isActive ?? true) ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {(variant.isActive ?? true)
                                ? t("gabinet.treatmentDetail.variants.active")
                                : t("gabinet.treatmentDetail.variants.inactive")}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className={variant.priceInherited ? "text-muted-foreground/60 italic" : "text-primary font-medium"}>
                              {formatCurrency(variant.resolvedPrice, treatment.currency ?? undefined)}
                              {variant.priceInherited && (
                                <span className="ml-1 text-xs">
                                  ({t("gabinet.treatmentDetail.variants.inherited")})
                                </span>
                              )}
                            </span>
                            <span className={variant.durationInherited ? "text-muted-foreground/60 italic" : "text-primary"}>
                              {variant.resolvedDuration} min
                              {variant.durationInherited && (
                                <span className="ml-1 text-xs">
                                  ({t("gabinet.treatmentDetail.variants.inherited")})
                                </span>
                              )}
                            </span>
                          </div>
                          {variant.resolvedShortDescription && (
                            <p className={`text-xs ${variant.shortDescriptionInherited ? "text-muted-foreground/60 italic" : "text-muted-foreground"}`}>
                              {variant.resolvedShortDescription}
                              {variant.shortDescriptionInherited && (
                                <span className="ml-1">
                                  ({t("gabinet.treatmentDetail.variants.inherited")})
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEditVariantDialog(variant)}
                          >
                            <Pencil className="h-3.5 w-3.5" variant="stroke" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDeleteVariant(variant._id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" variant="stroke" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ),
      },
      {
        label: t("gabinet.treatmentDetail.tabs.appointments"),
        count: treatmentAppointments?.length,
        content: (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-3">
              <Select
                value={aptStatusFilter}
                onValueChange={setAptStatusFilter}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t("gabinet.treatmentDetail.filterStatus")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("gabinet.treatmentDetail.allStatuses")}
                  </SelectItem>
                  {APPOINTMENT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(`gabinet.appointments.status.${status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={aptDateFrom}
                onChange={(e) => setAptDateFrom(e.target.value)}
                className="w-[160px]"
                placeholder={t("gabinet.treatmentDetail.dateFrom")}
              />
              <Input
                type="date"
                value={aptDateTo}
                onChange={(e) => setAptDateTo(e.target.value)}
                className="w-[160px]"
                placeholder={t("gabinet.treatmentDetail.dateTo")}
              />
              {(aptStatusFilter !== "all" || aptDateFrom || aptDateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAptStatusFilter("all");
                    setAptDateFrom("");
                    setAptDateTo("");
                  }}
                >
                  {t("common.clearFilters")}
                </Button>
              )}
            </div>

            {/* Appointments list */}
            <Card>
              <CardContent className="pt-6">
                {(treatmentAppointments ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    {t("gabinet.treatmentDetail.noAppointments")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(treatmentAppointments ?? []).map((apt) => (
                      <div
                        key={apt._id}
                        className="flex items-center justify-between rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() =>
                          navigate({
                            to: "/dashboard/gabinet/appointments/$appointmentId",
                            params: { appointmentId: apt._id },
                          })
                        }
                      >
                        <div className="flex items-center gap-4">
                          <div>
                            <span className="text-sm font-medium">{apt.date}</span>
                            <span className="text-sm text-muted-foreground ml-2">
                              {apt.startTime}–{apt.endTime}
                            </span>
                          </div>
                          <span className="text-sm">{apt.patientName}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {apt.employeeName}
                          </span>
                          <Badge variant={statusBadgeVariant(apt.status)}>
                            {t(`gabinet.appointments.status.${apt.status}`)}
                          </Badge>
                          {apt.notes && (
                            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" variant="stroke" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ),
      },
      {
        label: t("gabinet.treatmentDetail.tabs.activity"),
        content: (
          <ActivityFeed
            entries={activitiesToFeedEntries((activities ?? []) as any[])}
            maxHeight="600px"
          />
        ),
      },
    ];
  }, [
    treatment, detailedStats, recentAppointments, treatmentAppointments,
    treatmentEmployees, variants, activities, unassignedEmployees,
    editingParam, newOption, empSearchQuery, aptStatusFilter,
    aptDateFrom, aptDateTo, navigate, t, treatmentId, organizationId,
  ]);

  // Sidebar extra: statistics
  const sidebarExtra = useMemo(() => {
    if (!treatment) return null;
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {t("gabinet.treatmentDetail.statistics")}
        </p>
        <div className="rounded-md border p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar size={12} variant="stroke" />
              {t("gabinet.treatmentDetail.totalAppointments")}
            </span>
            <span className="text-xs font-semibold tabular-nums">{detailedStats?.total ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock size={12} variant="stroke" />
              {t("gabinet.treatmentDetail.thisMonth")}
            </span>
            <span className="text-xs font-semibold tabular-nums">{detailedStats?.thisMonth ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign size={12} variant="stroke" />
              {t("gabinet.treatmentDetail.revenue")}
            </span>
            <span className="text-xs font-semibold tabular-nums">
              {formatCurrency(detailedStats?.revenue ?? 0, treatment.currency ?? undefined)}
            </span>
          </div>
        </div>
      </div>
    );
  }, [treatment, detailedStats, t]);

  // --- Render ---

  return (
    <>
      <EntityDetailLayout
        isLoading={isLoading}
        notFound={!treatment && !isLoading}
        onBack={() => navigate({ to: "/dashboard/gabinet/treatments" })}
        title={treatment?.name ?? ""}
        subtitle={treatment?.category ?? t("gabinet.treatments.treatment")}
        avatarFallback={treatment?.name?.slice(0, 2).toUpperCase()}
        onEdit={() => setEditPanelOpen(true)}
        secondaryActions={[
          {
            label: treatment?.isActive
              ? t("gabinet.treatmentDetail.deactivate")
              : t("common.delete"),
            onClick: handleDeactivate,
            variant: "destructive" as const,
          },
        ]}
        fields={detailFields}
        expandedFieldCount={5}
        sidebarExtra={sidebarExtra}
        tabs={tabs}
      />

      {/* Edit side panel */}
      {treatment && (
        <SidePanel
          open={editPanelOpen}
          onOpenChange={setEditPanelOpen}
          title={t("common.edit")}
        >
          <TreatmentForm
            key={treatment._id}
            organizationId={organizationId}
            initialData={{
              name: treatment.name,
              description: treatment.description ?? undefined,
              category: treatment.category ?? undefined,
              duration: treatment.duration,
              price: treatment.price,
              currency: treatment.currency ?? undefined,
              taxRate: treatment.taxRate ?? undefined,
              requiredEquipment: treatment.requiredEquipment ?? undefined,
              requiredEquipmentIds: (treatment.requiredEquipmentIds as Id<"gabinetEquipment">[] | undefined) ?? undefined,
              contraindications: treatment.contraindications ?? undefined,
              preparationInstructions: treatment.preparationInstructions ?? undefined,
              aftercareInstructions: treatment.aftercareInstructions ?? undefined,
              requiresApproval: treatment.requiresApproval ?? undefined,
              color: treatment.color ?? undefined,
              sortOrder: treatment.sortOrder ?? undefined,
              treatmentCount: treatment.treatmentCount ?? undefined,
            }}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditPanelOpen(false)}
            isSubmitting={isSubmitting}
          />
        </SidePanel>
      )}

      {/* Variant create/edit dialog */}
      <Dialog
        open={variantDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setVariantDialogOpen(false);
            resetVariantForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingVariant
                ? t("gabinet.treatmentDetail.variants.editVariant")
                : t("gabinet.treatmentDetail.variants.addVariant")}
            </DialogTitle>
            <DialogDescription>
              {t("gabinet.treatmentDetail.variants.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Variant name */}
            <div className="space-y-2">
              <Label>{t("gabinet.treatmentDetail.variants.name")}</Label>
              <Input
                value={variantForm.name}
                onChange={(e) =>
                  setVariantForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder={t("gabinet.treatmentDetail.variants.namePlaceholder")}
              />
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between">
              <Label>{t("gabinet.treatmentDetail.variants.active")}</Label>
              <Switch
                checked={variantForm.isActive}
                onCheckedChange={(checked) =>
                  setVariantForm((prev) => ({ ...prev, isActive: checked }))
                }
              />
            </div>

            {/* Price override */}
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t("gabinet.treatmentDetail.variants.price")}</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {variantForm.overridePrice
                      ? t("gabinet.treatmentDetail.variants.overridden")
                      : t("gabinet.treatmentDetail.variants.inherited")}
                  </span>
                  <Switch
                    checked={variantForm.overridePrice}
                    onCheckedChange={(checked) =>
                      setVariantForm((prev) => ({
                        ...prev,
                        overridePrice: checked,
                        price: checked ? (prev.price || String(treatment?.price ?? 0)) : "",
                      }))
                    }
                  />
                </div>
              </div>
              {variantForm.overridePrice ? (
                <Input
                  type="number"
                  step="0.01"
                  value={variantForm.price}
                  onChange={(e) =>
                    setVariantForm((prev) => ({ ...prev, price: e.target.value }))
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground/60 italic">
                  {t("gabinet.treatmentDetail.variants.parentValue", {
                    value: formatCurrency(treatment?.price ?? 0, treatment?.currency ?? undefined),
                  })}
                </p>
              )}
            </div>

            {/* Duration override */}
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t("gabinet.treatmentDetail.variants.duration")}</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {variantForm.overrideDuration
                      ? t("gabinet.treatmentDetail.variants.overridden")
                      : t("gabinet.treatmentDetail.variants.inherited")}
                  </span>
                  <Switch
                    checked={variantForm.overrideDuration}
                    onCheckedChange={(checked) =>
                      setVariantForm((prev) => ({
                        ...prev,
                        overrideDuration: checked,
                        duration: checked ? (prev.duration || String(treatment?.duration ?? 0)) : "",
                      }))
                    }
                  />
                </div>
              </div>
              {variantForm.overrideDuration ? (
                <Input
                  type="number"
                  value={variantForm.duration}
                  onChange={(e) =>
                    setVariantForm((prev) => ({ ...prev, duration: e.target.value }))
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground/60 italic">
                  {t("gabinet.treatmentDetail.variants.parentValue", {
                    value: `${treatment?.duration ?? 0} min`,
                  })}
                </p>
              )}
            </div>

            {/* Short Description override */}
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t("gabinet.treatmentDetail.variants.shortDescription")}</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {variantForm.overrideShortDescription
                      ? t("gabinet.treatmentDetail.variants.overridden")
                      : t("gabinet.treatmentDetail.variants.inherited")}
                  </span>
                  <Switch
                    checked={variantForm.overrideShortDescription}
                    onCheckedChange={(checked) =>
                      setVariantForm((prev) => ({
                        ...prev,
                        overrideShortDescription: checked,
                        shortDescription: checked ? (prev.shortDescription || (treatment?.shortDescription ?? "")) : "",
                      }))
                    }
                  />
                </div>
              </div>
              {variantForm.overrideShortDescription ? (
                <Input
                  value={variantForm.shortDescription}
                  onChange={(e) =>
                    setVariantForm((prev) => ({ ...prev, shortDescription: e.target.value }))
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground/60 italic">
                  {treatment?.shortDescription
                    ? t("gabinet.treatmentDetail.variants.parentValue", {
                        value: treatment.shortDescription,
                      })
                    : "—"}
                </p>
              )}
            </div>

            {/* Description override */}
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t("gabinet.treatmentDetail.variants.description")}</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {variantForm.overrideDescription
                      ? t("gabinet.treatmentDetail.variants.overridden")
                      : t("gabinet.treatmentDetail.variants.inherited")}
                  </span>
                  <Switch
                    checked={variantForm.overrideDescription}
                    onCheckedChange={(checked) =>
                      setVariantForm((prev) => ({
                        ...prev,
                        overrideDescription: checked,
                        description: checked ? (prev.description || (treatment?.description ?? "")) : "",
                      }))
                    }
                  />
                </div>
              </div>
              {variantForm.overrideDescription ? (
                <RichTextEditor
                  value={variantForm.description}
                  onChange={(val) =>
                    setVariantForm((prev) => ({ ...prev, description: val ?? "" }))
                  }
                  minHeight="80px"
                />
              ) : (
                <p className="text-sm text-muted-foreground/60 italic line-clamp-2">
                  {treatment?.description
                    ? t("gabinet.treatmentDetail.variants.parentValue", {
                        value: treatment.description,
                      })
                    : "—"}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setVariantDialogOpen(false);
                resetVariantForm();
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSaveVariant}
              disabled={!variantForm.name.trim() || isSubmitting}
            >
              {isSubmitting ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
