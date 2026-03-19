import { useState, useMemo, useCallback, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { SidePanel } from "@/components/crm/side-panel";
import { TreatmentForm } from "@/components/gabinet/treatment-form";
import type { TreatmentFormData } from "@/components/gabinet/treatment-form";
import { EntityDetailLayout } from "@/components/crm/entity-detail-layout";
import type { DetailField } from "@/components/crm/entity-detail-layout";
import { EntityDocumentsTab } from "@/components/documents/entity-documents-tab";
import { TreatmentRequiredDocuments } from "@/components/documents/treatment-required-documents";
import type { RequiredFormTemplate } from "@/components/documents/treatment-required-documents";
import { Separator } from "@/components/ui/separator";
import { ActivityTimeline } from "@/components/activity-timeline/activity-timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  Pencil,
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Plus,
  Trash2,
  X,
  Settings2,
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

function TreatmentDetail() {
  const { treatmentId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // State
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Parameters tab state
  const [paramName, setParamName] = useState("");
  const [paramValue, setParamValue] = useState("");
  const [paramUnit, setParamUnit] = useState("");

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
  const updateTreatment = useMutation(api.gabinet.treatments.update);
  const removeTreatment = useMutation(api.gabinet.treatments.remove);
  const saveTreatmentParameters = useMutation(api.gabinet.treatments.saveTreatmentParameters);
  const setQualifiedTreatments = useMutation(api.gabinet.employees.setQualifiedTreatments);
  const createVariantMut = useMutation(api.gabinet.treatments.createVariant);
  const updateVariantMut = useMutation(api.gabinet.treatments.updateVariant);
  const deleteVariantMut = useMutation(api.gabinet.treatments.deleteVariant);
  const trackView = useMutation(api.recentlyViewed.track);

  // Queries
  const { data: treatment, isLoading } = useQuery(
    convexQuery(api.gabinet.treatments.getById, {
      organizationId,
      treatmentId: treatmentId as Id<"gabinetTreatments">,
    }),
  );

  const { data: stats } = useQuery(
    convexQuery(api.gabinet.treatments.getTreatmentStats, {
      organizationId,
      treatmentId: treatmentId as Id<"gabinetTreatments">,
    }),
  );

  const { data: treatmentAppointments } = useQuery(
    convexQuery(api.gabinet.treatments.listTreatmentAppointments, {
      organizationId,
      treatmentId: treatmentId as Id<"gabinetTreatments">,
      status: aptStatusFilter !== "all" ? aptStatusFilter : undefined,
      dateFrom: aptDateFrom || undefined,
      dateTo: aptDateTo || undefined,
    }),
  );

  const { data: treatmentEmployees } = useQuery(
    convexQuery(api.gabinet.treatments.getTreatmentEmployees, {
      organizationId,
      treatmentId: treatmentId as Id<"gabinetTreatments">,
    }),
  );

  const { data: variants } = useQuery(
    convexQuery(api.gabinet.treatments.listVariants, {
      organizationId,
      treatmentId: treatmentId as Id<"gabinetTreatments">,
    }),
  );

  // Activities for the new Activity tab
  const { data: activitiesData } = useQuery(
    convexQuery(api.activities.getForEntity, {
      organizationId,
      entityType: "gabinetTreatment",
      entityId: treatmentId,
      paginationOpts: { numItems: 50, cursor: null },
    }),
  );
  const activities = activitiesData?.page;

  // All org employees for the assign picker
  const { data: allGabinetEmployees } = useQuery(
    convexQuery(api.gabinet.employees.listAll, { organizationId }),
  );

  const allEmps = allGabinetEmployees ?? [];

  // Track recently viewed
  useEffect(() => {
    if (treatment && organizationId) {
      trackView({ organizationId, entityType: "gabinetTreatments", entityId: treatment._id, entityLabel: treatment.name });
    }
  }, [treatment?._id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setEditPanelOpen(false);
      toast.success(t("common.saved"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddParameter = async () => {
    if (!paramName.trim() || !paramValue.trim()) return;
    const currentParams = treatment!.parameters ?? [];
    const newParams = [
      ...currentParams,
      { name: paramName.trim(), value: paramValue.trim(), unit: paramUnit.trim() || undefined },
    ];
    await saveTreatmentParameters({
      organizationId,
      treatmentId: treatmentId as Id<"gabinetTreatments">,
      parameters: newParams,
    });
    setParamName("");
    setParamValue("");
    setParamUnit("");
    toast.success(t("common.saved"));
  };

  const handleRemoveParameter = async (index: number) => {
    const currentParams = treatment!.parameters ?? [];
    const newParams = currentParams.filter((_, i) => i !== index);
    await saveTreatmentParameters({
      organizationId,
      treatmentId: treatmentId as Id<"gabinetTreatments">,
      parameters: newParams,
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

  // --- Build header subtitle with badges ---
  const headerSubtitle = treatment ? (
    <div className="flex items-center gap-2 mt-1">
      {treatment.color && (
        <span
          className="h-4 w-4 rounded-full shrink-0 inline-block"
          style={{ backgroundColor: treatment.color }}
        />
      )}
      <Badge variant={treatment.isActive ? "default" : "secondary"}>
        {treatment.isActive ? t("common.active") : t("common.inactive")}
      </Badge>
      {treatment.category && (
        <Badge variant="outline">{treatment.category}</Badge>
      )}
    </div>
  ) : undefined;

  // --- Actions menu ---
  const actionsMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {t("detail.actions.actions")}
          <ChevronDown className="ml-1 h-4 w-4" variant="stroke" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setEditPanelOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" variant="stroke" />
          {t("common.edit")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleDeactivate}
          className="text-destructive focus:text-destructive"
        >
          {treatment?.isActive
            ? t("gabinet.treatmentDetail.deactivate")
            : t("common.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // --- Build sidebar fields ---
  const fields: DetailField[] = useMemo(() => {
    if (!treatment) return [];
    const f: DetailField[] = [
      {
        fieldKey: "price",
        label: t("gabinet.treatments.price"),
        value: (
          <span className="font-medium text-primary">
            {formatCurrency(treatment.price, treatment.currency ?? undefined)}
          </span>
        ),
      },
      {
        fieldKey: "duration",
        label: t("gabinet.treatments.duration"),
        value: <span className="font-medium text-primary">{treatment.duration} min</span>,
      },
    ];

    if (treatment.taxRate != null) {
      f.push({
        fieldKey: "taxRate",
        label: t("gabinet.treatments.taxRate"),
        value: <span className="font-medium text-primary">{treatment.taxRate}%</span>,
      });
    }

    if (treatment.requiresApproval) {
      f.push({
        fieldKey: "requiresApproval",
        label: t("gabinet.treatments.requiresApproval"),
        value: <Badge variant="outline">{t("common.yes")}</Badge>,
      });
    }

    if (treatment.requiredEquipment && treatment.requiredEquipment.length > 0) {
      f.push({
        fieldKey: "requiredEquipment",
        label: t("gabinet.treatments.requiredEquipment"),
        value: treatment.requiredEquipment.join(", "),
      });
    }

    if (treatment.shortDescription) {
      f.push({
        fieldKey: "shortDescription",
        label: t("gabinet.treatmentDetail.shortDescription"),
        value: <span className="text-muted-foreground">{treatment.shortDescription}</span>,
      });
    }

    if (treatment.description) {
      f.push({
        fieldKey: "description",
        label: t("gabinet.treatmentDetail.description"),
        value: <span className="whitespace-pre-wrap text-muted-foreground">{treatment.description}</span>,
      });
    }

    if (treatment.contraindications) {
      f.push({
        fieldKey: "contraindications",
        label: t("gabinet.treatments.contraindications"),
        value: <span className="whitespace-pre-wrap">{treatment.contraindications}</span>,
      });
    }

    if (treatment.preparationInstructions) {
      f.push({
        fieldKey: "preparationInstructions",
        label: t("gabinet.treatments.preparationInstructions"),
        value: <span className="whitespace-pre-wrap">{treatment.preparationInstructions}</span>,
      });
    }

    if (treatment.aftercareInstructions) {
      f.push({
        fieldKey: "aftercareInstructions",
        label: t("gabinet.treatments.aftercareInstructions"),
        value: <span className="whitespace-pre-wrap">{treatment.aftercareInstructions}</span>,
      });
    }

    return f;
  }, [treatment, t]);

  // --- Build sidebar extra: statistics ---
  const sidebarExtra = treatment ? (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{t("gabinet.treatmentDetail.statistics")}</h3>
      <div className="flex items-center gap-3">
        <Calendar className="h-4 w-4 text-muted-foreground" variant="stroke" />
        <span className="text-sm text-muted-foreground">
          {t("gabinet.treatmentDetail.totalAppointments")}
        </span>
        <span className="ml-auto text-sm font-semibold">
          {stats?.totalAppointments ?? 0}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Clock className="h-4 w-4 text-muted-foreground" variant="stroke" />
        <span className="text-sm text-muted-foreground">
          {t("gabinet.treatmentDetail.thisMonth")}
        </span>
        <span className="ml-auto text-sm font-semibold">
          {stats?.thisMonthAppointments ?? 0}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <DollarSign className="h-4 w-4 text-muted-foreground" variant="stroke" />
        <span className="text-sm text-muted-foreground">
          {t("gabinet.treatmentDetail.revenue")}
        </span>
        <span className="ml-auto text-sm font-semibold">
          {formatCurrency(stats?.revenue ?? 0, treatment.currency ?? undefined)}
        </span>
      </div>
    </div>
  ) : undefined;

  // --- Build tabs ---
  const tabs = useMemo(() => {
    if (!treatment) return [];
    return [
      {
        label: t("gabinet.treatmentDetail.tabs.overview"),
        content: (
          <div className="space-y-6">
            {/* KPI row */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-muted-foreground" variant="stroke" />
                    <div>
                      <p className="text-2xl font-bold">{stats?.totalAppointments ?? 0}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("gabinet.treatmentDetail.totalAppointments")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" variant="stroke" />
                    <div>
                      <p className="text-2xl font-bold">{stats?.thisMonthAppointments ?? 0}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("gabinet.treatmentDetail.thisMonth")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-muted-foreground" variant="stroke" />
                    <div>
                      <p className="text-2xl font-bold">
                        {formatCurrency(stats?.revenue ?? 0, treatment.currency ?? undefined)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("gabinet.treatmentDetail.revenue")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent appointments */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  {t("gabinet.treatmentDetail.recentAppointments")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentAppointments.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {t("gabinet.treatmentDetail.noAppointments")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recentAppointments.map((apt) => (
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
                        <div className="flex items-center gap-3">
                          <div className="text-sm">
                            <span className="font-medium">{apt.date}</span>
                            <span className="text-muted-foreground ml-2">
                              {apt.startTime}–{apt.endTime}
                            </span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {apt.patientName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {apt.employeeName}
                          </span>
                          <Badge variant={statusBadgeVariant(apt.status)}>
                            {t(`gabinet.appointments.status.${apt.status}`)}
                          </Badge>
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
                {(treatment.parameters ?? []).length > 0 && (
                  <div className="space-y-2">
                    {(treatment.parameters ?? []).map((param, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-medium">{param.name}</span>
                          <span className="text-sm text-muted-foreground">
                            {param.value}
                            {param.unit ? ` ${param.unit}` : ""}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleRemoveParameter(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" variant="stroke" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add parameter form */}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">
                      {t("gabinet.treatmentDetail.parameterName")}
                    </label>
                    <Input
                      value={paramName}
                      onChange={(e) => setParamName(e.target.value)}
                      placeholder={t("gabinet.treatmentDetail.parameterNamePlaceholder")}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">
                      {t("gabinet.treatmentDetail.parameterValue")}
                    </label>
                    <Input
                      value={paramValue}
                      onChange={(e) => setParamValue(e.target.value)}
                      placeholder={t("gabinet.treatmentDetail.parameterValuePlaceholder")}
                      className="mt-1"
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-muted-foreground">
                      {t("gabinet.treatmentDetail.parameterUnit")}
                    </label>
                    <Input
                      value={paramUnit}
                      onChange={(e) => setParamUnit(e.target.value)}
                      placeholder="°C, ml..."
                      className="mt-1"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAddParameter}
                    disabled={!paramName.trim() || !paramValue.trim()}
                  >
                    <Plus className="h-4 w-4 mr-1" variant="stroke" />
                    {t("common.add")}
                  </Button>
                </div>
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
          <ActivityTimeline
            activities={activities ?? []}
            maxHeight="600px"
          />
        ),
      },
    ];
  }, [
    treatment, stats, recentAppointments, treatmentAppointments,
    treatmentEmployees, variants, activities, unassignedEmployees,
    paramName, paramValue, paramUnit, empSearchQuery, aptStatusFilter,
    aptDateFrom, aptDateTo, navigate, t, treatmentId, organizationId,
  ]);

  // --- Render ---
  return (
    <>
      <EntityDetailLayout
        variant="default"
        isLoading={isLoading}
        notFound={!treatment && !isLoading}
        onBack={() => navigate({ to: "/dashboard/gabinet/treatments" })}
        title={treatment?.name ?? ""}
        headerSubtitle={headerSubtitle}
        avatarFallback={treatment?.name?.[0]?.toUpperCase()}
        actionsMenu={actionsMenu}
        onEdit={() => setEditPanelOpen(true)}
        fields={fields}
        expandedFieldCount={4}
        sidebarExtra={sidebarExtra}
        tabs={tabs}
        defaultTab={t("gabinet.treatmentDetail.tabs.overview")}
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
            initialData={{
              name: treatment.name,
              description: treatment.description ?? undefined,
              category: treatment.category ?? undefined,
              duration: treatment.duration,
              price: treatment.price,
              currency: treatment.currency ?? undefined,
              taxRate: treatment.taxRate ?? undefined,
              requiredEquipment: treatment.requiredEquipment ?? undefined,
              contraindications: treatment.contraindications ?? undefined,
              preparationInstructions: treatment.preparationInstructions ?? undefined,
              aftercareInstructions: treatment.aftercareInstructions ?? undefined,
              requiresApproval: treatment.requiresApproval ?? undefined,
              color: treatment.color ?? undefined,
              sortOrder: treatment.sortOrder ?? undefined,
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
        <DialogContent className="sm:max-w-[500px]">
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
                <Textarea
                  value={variantForm.description}
                  onChange={(e) =>
                    setVariantForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  rows={3}
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
