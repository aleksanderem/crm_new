import { useState, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { SidePanel } from "@/components/crm/side-panel";
import { TreatmentForm } from "@/components/gabinet/treatment-form";
import type { TreatmentFormData } from "@/components/gabinet/treatment-form";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  ChevronLeft,
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

const tabTriggerClass =
  "data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md px-3 py-1.5 text-sm";

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

  // Documents tab state
  const [docSearchQuery, setDocSearchQuery] = useState("");

  // Employees tab state
  const [empSearchQuery, setEmpSearchQuery] = useState("");

  // Appointments tab filters
  const [aptStatusFilter, setAptStatusFilter] = useState<string>("all");
  const [aptDateFrom, setAptDateFrom] = useState("");
  const [aptDateTo, setAptDateTo] = useState("");

  // Mutations
  const updateTreatment = useMutation(api.gabinet.treatments.update);
  const removeTreatment = useMutation(api.gabinet.treatments.remove);
  const saveTreatmentParameters = useMutation(api.gabinet.treatments.saveTreatmentParameters);
  const setRequiredDocumentTemplates = useMutation(api.gabinet.treatments.setRequiredDocumentTemplates);
  const setQualifiedTreatments = useMutation(api.gabinet.employees.setQualifiedTreatments);

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

  const { data: treatmentDocTemplates } = useQuery(
    convexQuery(api.gabinet.treatments.getTreatmentDocumentTemplates, {
      organizationId,
      treatmentId: treatmentId as Id<"gabinetTreatments">,
    }),
  );

  // All document templates for the assign picker
  const { data: allDocTemplates } = useQuery(
    convexQuery(api.gabinet.documentTemplates.list, { organizationId }),
  );

  // All org employees for the assign picker
  const { data: allGabinetEmployees } = useQuery(
    convexQuery(api.gabinet.employees.listAll, { organizationId }),
  );

  const allEmps = allGabinetEmployees ?? [];

  // Derived: unassigned document templates
  const assignedTemplateIds = useMemo(() => {
    return new Set(treatment?.requiredDocumentTemplateIds ?? []);
  }, [treatment?.requiredDocumentTemplateIds]);

  const unassignedTemplates = useMemo(() => {
    if (!allDocTemplates) return [];
    const filtered = allDocTemplates.filter(
      (tmpl) => tmpl.isActive && !assignedTemplateIds.has(tmpl._id),
    );
    if (!docSearchQuery) return filtered;
    const q = docSearchQuery.toLowerCase();
    return filtered.filter((tmpl) => tmpl.name.toLowerCase().includes(q));
  }, [allDocTemplates, assignedTemplateIds, docSearchQuery]);

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

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-12 w-64" />
        <div className="flex gap-6">
          <Skeleton className="h-96 w-[420px]" />
          <Skeleton className="h-96 flex-1" />
        </div>
      </div>
    );
  }

  if (!treatment) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{t("common.notFound")}</p>
      </div>
    );
  }

  // --- Handlers ---

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
    const currentParams = treatment.parameters ?? [];
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
    const currentParams = treatment.parameters ?? [];
    const newParams = currentParams.filter((_, i) => i !== index);
    await saveTreatmentParameters({
      organizationId,
      treatmentId: treatmentId as Id<"gabinetTreatments">,
      parameters: newParams,
    });
    toast.success(t("common.saved"));
  };

  const handleAssignDocument = async (templateId: string) => {
    const current = treatment.requiredDocumentTemplateIds ?? [];
    await setRequiredDocumentTemplates({
      organizationId,
      treatmentId: treatmentId as Id<"gabinetTreatments">,
      templateIds: [...current, templateId as Id<"gabinetDocumentTemplates">],
    });
    setDocSearchQuery("");
    toast.success(t("common.saved"));
  };

  const handleUnassignDocument = async (templateId: string) => {
    const current = treatment.requiredDocumentTemplateIds ?? [];
    await setRequiredDocumentTemplates({
      organizationId,
      treatmentId: treatmentId as Id<"gabinetTreatments">,
      templateIds: current.filter((id) => id !== templateId),
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

  // --- Render ---
  return (
    <>
      <div className="flex h-full flex-col bg-muted/30">
        {/* Top header bar */}
        <div className="flex items-center justify-between border-b bg-background px-6 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate({ to: "/dashboard/gabinet/treatments" })}
            >
              <ChevronLeft className="h-4 w-4" variant="stroke" />
            </Button>
            {treatment.color && (
              <span
                className="h-5 w-5 rounded-full shrink-0"
                style={{ backgroundColor: treatment.color }}
              />
            )}
            <h1 className="text-xl font-bold">{treatment.name}</h1>
            <Badge variant={treatment.isActive ? "default" : "secondary"}>
              {treatment.isActive ? t("common.active") : t("common.inactive")}
            </Badge>
            {treatment.category && (
              <Badge variant="outline">{treatment.category}</Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
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
                  {treatment.isActive
                    ? t("gabinet.treatmentDetail.deactivate")
                    : t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Main content: sidebar + tabs */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar */}
          <ScrollArea className="w-[420px] shrink-0 border-r bg-background">
            <div className="p-5 space-y-4">
              {/* Key info card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    {t("gabinet.treatmentDetail.info")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-4">
                    <span className="w-28 shrink-0 text-right text-sm text-muted-foreground">
                      {t("gabinet.treatments.price")}
                    </span>
                    <span className="text-sm font-medium text-primary">
                      {formatCurrency(treatment.price, treatment.currency ?? undefined)}
                    </span>
                  </div>
                  <div className="flex items-start gap-4">
                    <span className="w-28 shrink-0 text-right text-sm text-muted-foreground">
                      {t("gabinet.treatments.duration")}
                    </span>
                    <span className="text-sm font-medium text-primary">
                      {treatment.duration} min
                    </span>
                  </div>
                  {treatment.taxRate != null && (
                    <div className="flex items-start gap-4">
                      <span className="w-28 shrink-0 text-right text-sm text-muted-foreground">
                        {t("gabinet.treatments.taxRate")}
                      </span>
                      <span className="text-sm font-medium text-primary">
                        {treatment.taxRate}%
                      </span>
                    </div>
                  )}
                  {treatment.requiresApproval && (
                    <div className="flex items-start gap-4">
                      <span className="w-28 shrink-0 text-right text-sm text-muted-foreground">
                        {t("gabinet.treatments.requiresApproval")}
                      </span>
                      <Badge variant="outline">{t("common.yes")}</Badge>
                    </div>
                  )}
                  {treatment.requiredEquipment && treatment.requiredEquipment.length > 0 && (
                    <div className="flex items-start gap-4">
                      <span className="w-28 shrink-0 text-right text-sm text-muted-foreground">
                        {t("gabinet.treatments.requiredEquipment")}
                      </span>
                      <span className="text-sm text-primary">
                        {treatment.requiredEquipment.join(", ")}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Stats card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    {t("gabinet.treatmentDetail.statistics")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
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
                </CardContent>
              </Card>

              {/* Description card */}
              {treatment.description && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      {t("gabinet.treatmentDetail.description")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {treatment.description}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Contraindications / Preparation / Aftercare */}
              {(treatment.contraindications || treatment.preparationInstructions || treatment.aftercareInstructions) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      {t("gabinet.treatmentDetail.instructions")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {treatment.contraindications && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          {t("gabinet.treatments.contraindications")}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{treatment.contraindications}</p>
                      </div>
                    )}
                    {treatment.preparationInstructions && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          {t("gabinet.treatments.preparationInstructions")}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{treatment.preparationInstructions}</p>
                      </div>
                    )}
                    {treatment.aftercareInstructions && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          {t("gabinet.treatments.aftercareInstructions")}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{treatment.aftercareInstructions}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>

          {/* Right: Tabs content */}
          <Tabs defaultValue="overview" className="flex flex-1 flex-col">
            <div className="border-b bg-background px-6 py-1">
              <TabsList className="bg-transparent">
                <TabsTrigger value="overview" className={tabTriggerClass}>
                  {t("gabinet.treatmentDetail.tabs.overview")}
                </TabsTrigger>
                <TabsTrigger value="parameters" className={tabTriggerClass}>
                  {t("gabinet.treatmentDetail.tabs.parameters")}
                </TabsTrigger>
                <TabsTrigger value="documents" className={tabTriggerClass}>
                  {t("gabinet.treatmentDetail.tabs.documents")}
                </TabsTrigger>
                <TabsTrigger value="employees" className={tabTriggerClass}>
                  {t("gabinet.treatmentDetail.tabs.employees")}
                </TabsTrigger>
                <TabsTrigger value="appointments" className={tabTriggerClass}>
                  {t("gabinet.treatmentDetail.tabs.appointments")}
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1">
              {/* ========== Overview Tab ========== */}
              <TabsContent value="overview" className="m-0 p-6">
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
              </TabsContent>

              {/* ========== Parameters Tab ========== */}
              <TabsContent value="parameters" className="m-0 p-6">
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
              </TabsContent>

              {/* ========== Documents Tab ========== */}
              <TabsContent value="documents" className="m-0 p-6">
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">
                        {t("gabinet.treatmentDetail.requiredDocuments")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        {t("gabinet.treatmentDetail.documentsDescription")}
                      </p>

                      {/* Assigned templates */}
                      {(treatmentDocTemplates ?? []).length > 0 ? (
                        <div className="space-y-2">
                          {(treatmentDocTemplates ?? []).map((tmpl) => (
                            <div
                              key={tmpl._id}
                              className="flex items-center justify-between rounded-md border p-3"
                            >
                              <div className="flex items-center gap-3">
                                <FileText className="h-4 w-4 text-muted-foreground" variant="stroke" />
                                <div>
                                  <span className="text-sm font-medium">{tmpl.name}</span>
                                  <Badge variant="outline" className="ml-2 text-xs">
                                    {tmpl.type}
                                  </Badge>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => handleUnassignDocument(tmpl._id)}
                              >
                                <X className="h-3.5 w-3.5" variant="stroke" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground py-2 text-center">
                          {t("gabinet.treatmentDetail.noDocuments")}
                        </p>
                      )}

                      {/* Add document template */}
                      <div className="border-t pt-4 space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">
                          {t("gabinet.treatmentDetail.addDocument")}
                        </label>
                        <Input
                          value={docSearchQuery}
                          onChange={(e) => setDocSearchQuery(e.target.value)}
                          placeholder={t("gabinet.treatmentDetail.searchDocuments")}
                          className="mb-2"
                        />
                        {unassignedTemplates.length > 0 && (
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {unassignedTemplates.map((tmpl) => (
                              <div
                                key={tmpl._id}
                                className="flex items-center justify-between rounded-md p-2 hover:bg-muted/50 cursor-pointer transition-colors"
                                onClick={() => handleAssignDocument(tmpl._id)}
                              >
                                <div className="flex items-center gap-2">
                                  <FileText className="h-3.5 w-3.5 text-muted-foreground" variant="stroke" />
                                  <span className="text-sm">{tmpl.name}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {tmpl.type}
                                  </Badge>
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
              </TabsContent>

              {/* ========== Employees Tab ========== */}
              <TabsContent value="employees" className="m-0 p-6">
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
              </TabsContent>

              {/* ========== Appointments Tab ========== */}
              <TabsContent value="appointments" className="m-0 p-6">
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
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </div>

      {/* Edit side panel */}
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
    </>
  );
}
