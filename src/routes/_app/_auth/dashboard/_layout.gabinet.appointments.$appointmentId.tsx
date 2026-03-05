import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { SidePanel } from "@/components/crm/side-panel";
import { DocumentViewer } from "@/components/gabinet/documents/document-viewer";
import { SignaturePad } from "@/components/gabinet/documents/signature-pad";
import { EmptyState } from "@/components/layout/empty-state";
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Mail,
  Phone,
  FileText,
  CreditCard,
  History,
  StickyNote,
  Activity,
  UserCircle,
  CheckCircle,
  XCircle,
  PlayCircle,
  AlertTriangle,
  Clock4,
  DollarSign,
  RefreshCcw,
  Info,
  Sparkles,
  ShieldAlert,
  Heart,
  Plus,
  Eye,
  PenTool,
  Pencil,
  Trash2,
  Download,
  Upload,
  FilePlus,
} from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/appointments/$appointmentId"
)({
  component: AppointmentDetail,
});

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline" | "success"> = {
  scheduled: "secondary",
  confirmed: "default",
  in_progress: "default",
  completed: "success",
  cancelled: "destructive",
  no_show: "destructive",
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["confirmed", "cancelled", "no_show"],
  confirmed: ["in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

function AppointmentDetail() {
  const { appointmentId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [internalNotes, setInternalNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Document management state
  const [docPanelOpen, setDocPanelOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [viewDocId, setViewDocId] = useState<string | null>(null);
  const [signDocId, setSignDocId] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState<string>("consent");
  const [docContent, setDocContent] = useState("");
  const [docTemplateId, setDocTemplateId] = useState("");
  const [isDocSubmitting, setIsDocSubmitting] = useState(false);

  const updateStatus = useMutation(api.gabinet.appointments.updateStatus);
  const updateAppointment = useMutation(api.gabinet.appointments.update);
  const createDoc = useMutation(api.gabinet.documents.create);
  const updateDoc = useMutation(api.gabinet.documents.update);
  const signDoc = useMutation(api.gabinet.documents.sign);
  const requestDocSig = useMutation(api.gabinet.documents.requestSignature);
  const archiveDoc = useMutation(api.gabinet.documents.archive);

  // Fetch document templates
  const { data: templates } = useQuery(
    convexQuery(api.gabinet.documentTemplates.list, { organizationId })
  );

  const { data: detail, isLoading, refetch } = useQuery(
    convexQuery(api.gabinet.appointments.getFullDetail, {
      organizationId,
      appointmentId: appointmentId as Id<"gabinetAppointments">,
    })
  );

  // Initialize internal notes from appointment data
  useState(() => {
    if (detail?.appointment.internalNotes) {
      setInternalNotes(detail.appointment.internalNotes);
    }
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96 col-span-2" />
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("common.notFound")}</p>
        <Button variant="outline" onClick={() => navigate({ to: "/dashboard/gabinet/calendar" })}>
          <ArrowLeft className="mr-2 h-4 w-4" variant="stroke" />
          {t("common.back")}
        </Button>
      </div>
    );
  }

  const { appointment, patient, treatment, employee, documents, payments, notes, patientHistory, loyaltyBalance, loyaltyTier } = detail;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  };

  const formatTime = (time: string) => {
    return time.slice(0, 5);
  };

  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("pl-PL");
  };

  const getPatientInitials = () => {
    if (!patient) return "?";
    return `${patient.firstName?.[0] ?? ""}${patient.lastName?.[0] ?? ""}`.toUpperCase();
  };

  const getEmployeeName = () => {
    if (!employee) return "-";
    return employee.name ?? employee.email ?? "-";
  };

  const getEmployeeInitials = () => {
    if (!employee) return "?";
    const name = employee.name ?? employee.email ?? "";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const calculateDuration = () => {
    const [startH, startM] = appointment.startTime.split(":").map(Number);
    const [endH, endM] = appointment.endTime.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return endMinutes - startMinutes;
  };

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === "cancelled") {
      setCancelDialogOpen(true);
      return;
    }

    setIsUpdating(true);
    try {
      await updateStatus({
        organizationId,
        appointmentId: appointment._id,
        status: newStatus as any,
      });
      toast.success(t("gabinet.appointments.statusUpdated"));
      refetch();
    } catch (error: any) {
      toast.error(error.message ?? t("common.error"));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelReason.trim()) {
      toast.error(t("gabinet.appointments.cancelReasonRequired"));
      return;
    }

    setIsUpdating(true);
    try {
      await updateAppointment({
        organizationId,
        appointmentId: appointment._id,
        status: "cancelled",
        cancellationReason: cancelReason.trim(),
      });
      toast.success(t("gabinet.appointments.cancelled"));
      setCancelDialogOpen(false);
      setCancelReason("");
      refetch();
    } catch (error: any) {
      toast.error(error.message ?? t("common.error"));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveInternalNotes = async () => {
    setIsSavingNotes(true);
    try {
      await updateAppointment({
        organizationId,
        appointmentId: appointment._id,
        internalNotes: internalNotes.trim() || undefined,
      });
      toast.success(t("common.saved"));
      refetch();
    } catch (error: any) {
      toast.error(error.message ?? t("common.error"));
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Document management handlers
  const resetDocForm = () => {
    setEditingDocId(null);
    setDocTitle("");
    setDocType("consent");
    setDocContent("");
    setDocTemplateId("");
  };

  const openEditDoc = (doc: any) => {
    setEditingDocId(doc._id);
    setDocTitle(doc.title);
    setDocType(doc.type);
    setDocContent(doc.content ?? "");
    setDocPanelOpen(true);
  };

  const handleRequestSignature = async (docId: Id<"gabinetDocuments">) => {
    try {
      await requestDocSig({ organizationId, documentId: docId });
      toast.success(t("gabinet.documents.signatureRequested"));
      refetch();
    } catch (error: any) {
      toast.error(error.message ?? t("common.error"));
    }
  };

  const handleArchiveDoc = async (docId: Id<"gabinetDocuments">) => {
    if (!confirm(t("common.confirmDelete"))) return;
    try {
      await archiveDoc({ organizationId, documentId: docId });
      toast.success(t("common.deleted"));
      refetch();
    } catch (error: any) {
      toast.error(error.message ?? t("common.error"));
    }
  };

  const handleDocSubmit = async () => {
    if (!docTitle.trim()) {
      toast.error(t("common.titleRequired"));
      return;
    }

    setIsDocSubmitting(true);
    try {
      if (editingDocId) {
        await updateDoc({
          organizationId,
          documentId: editingDocId as Id<"gabinetDocuments">,
          title: docTitle,
          content: docContent || undefined,
        });
        toast.success(t("common.saved"));
      } else {
        await createDoc({
          organizationId,
          patientId: patient!._id,
          appointmentId: appointment._id,
          templateId: docTemplateId ? docTemplateId as Id<"gabinetDocumentTemplates"> : undefined,
          title: docTitle,
          type: docType as any,
          content: docContent || undefined,
        });
        toast.success(t("gabinet.documents.created"));
      }
      setDocPanelOpen(false);
      resetDocForm();
      refetch();
    } catch (error: any) {
      toast.error(error.message ?? t("common.error"));
    } finally {
      setIsDocSubmitting(false);
    }
  };

  const handleSign = async (signatureData: string) => {
    if (!signDocId) return;
    try {
      await signDoc({
        organizationId,
        documentId: signDocId as Id<"gabinetDocuments">,
        signatureData,
      });
      toast.success(t("gabinet.documents.signed"));
      setSignDocId(null);
      refetch();
    } catch (error: any) {
      toast.error(error.message ?? t("common.error"));
    }
  };

  const availableTransitions = VALID_TRANSITIONS[appointment.status] ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="border-b px-6 py-3">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/dashboard" className="hover:text-foreground">
            {t("nav.home")}
          </Link>
          <span>/</span>
          <Link to="/dashboard/gabinet/calendar" className="hover:text-foreground">
            {t("nav.gabinet")} / {t("nav.calendar")}
          </Link>
          <span>/</span>
          <span className="text-foreground">
            {t("gabinet.appointments.appointment")} #{appointment._id.slice(-6)}
          </span>
        </nav>
      </div>

      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/dashboard/gabinet/calendar" })}>
            <ArrowLeft className="h-4 w-4" variant="stroke" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">
              {treatment?.name ?? t("gabinet.appointments.appointment")} - {patient?.firstName} {patient?.lastName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatDate(appointment.date)} • {formatTime(appointment.startTime)} - {formatTime(appointment.endTime)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={statusColors[appointment.status] ?? "secondary"} className="text-sm">
            {t(`gabinet.appointments.status.${appointment.status}`)}
          </Badge>
          {/* Status action buttons */}
          {availableTransitions.length > 0 && (
            <div className="flex items-center gap-2">
              {availableTransitions.includes("confirmed") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleStatusChange("confirmed")}
                  disabled={isUpdating}
                >
                  <CheckCircle className="mr-2 h-4 w-4" variant="stroke" />
                  {t("gabinet.appointments.actions.confirm")}
                </Button>
              )}
              {availableTransitions.includes("in_progress") && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleStatusChange("in_progress")}
                  disabled={isUpdating}
                >
                  <PlayCircle className="mr-2 h-4 w-4" variant="stroke" />
                  {t("gabinet.appointments.actions.start")}
                </Button>
              )}
              {availableTransitions.includes("completed") && (
                <Button
                  size="sm"
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => handleStatusChange("completed")}
                  disabled={isUpdating}
                >
                  <CheckCircle className="mr-2 h-4 w-4" variant="stroke" />
                  {t("gabinet.appointments.actions.complete")}
                </Button>
              )}
              {availableTransitions.includes("no_show") && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleStatusChange("no_show")}
                  disabled={isUpdating}
                >
                  <Clock4 className="mr-2 h-4 w-4" variant="stroke" />
                  {t("gabinet.appointments.actions.noShow")}
                </Button>
              )}
              {availableTransitions.includes("cancelled") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleStatusChange("cancelled")}
                  disabled={isUpdating}
                >
                  <XCircle className="mr-2 h-4 w-4" variant="stroke" />
                  {t("gabinet.appointments.actions.cancel")}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 grid grid-cols-3 gap-6 p-6">
        {/* Left sidebar - Patient & Appointment info */}
        <div className="space-y-4">
          {/* Patient card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" variant="stroke" />
                {t("gabinet.patients.patient")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>{getPatientInitials()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">
                    {patient?.firstName} {patient?.lastName}
                  </p>
                  {patient?.email && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" variant="stroke" />
                      {patient.email}
                    </p>
                  )}
                </div>
              </div>
              {patient?.phone && (
                <p className="text-sm flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" variant="stroke" />
                  {patient.phone}
                </p>
              )}
              {loyaltyBalance > 0 && (
                <div className="pt-2">
                  <Badge variant="outline">
                    ⭐ {loyaltyBalance} {t("gabinet.loyalty.points")}
                  </Badge>
                  {loyaltyTier && <span className="ml-2 text-xs text-muted-foreground">{loyaltyTier}</span>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Appointment details card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" variant="stroke" />
                {t("gabinet.appointments.details")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("gabinet.treatments.treatment")}</span>
                <span className="font-medium">{treatment?.name ?? "-"}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" variant="stroke" />
                  {t("common.date")}
                </span>
                <span className="font-medium">{formatDate(appointment.date)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("common.time")}</span>
                <span className="font-medium">
                  {formatTime(appointment.startTime)} - {formatTime(appointment.endTime)}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <UserCircle className="h-3 w-3" variant="stroke" />
                  {t("gabinet.employees.employee")}
                </span>
                <span className="font-medium">{getEmployeeName()}</span>
              </div>
              {treatment?.price !== undefined && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t("common.price")}</span>
                    <span className="font-medium">
                      {treatment.price.toFixed(2)} {treatment.currency ?? "PLN"}
                    </span>
                  </div>
                </>
              )}
              {appointment.notes && (
                <>
                  <Separator />
                  <div>
                    <span className="text-sm text-muted-foreground">{t("common.notes")}</span>
                    <p className="text-sm mt-1">{appointment.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Quick stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("common.stats")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{documents.length}</p>
                  <p className="text-xs text-muted-foreground">{t("gabinet.documents.documents")}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{payments.length}</p>
                  <p className="text-xs text-muted-foreground">{t("gabinet.payments.payments")}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{notes.length}</p>
                  <p className="text-xs text-muted-foreground">{t("common.notes")}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{patientHistory.length}</p>
                  <p className="text-xs text-muted-foreground">{t("gabinet.patients.history")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right main area - Tabs */}
        <div className="col-span-2">
          <Tabs defaultValue="details" className="h-full">
            <TabsList>
              <TabsTrigger value="details">
                <Activity className="mr-2 h-4 w-4" variant="stroke" />
                {t("gabinet.appointments.tabs.details")}
              </TabsTrigger>
              <TabsTrigger value="documents">
                <FileText className="mr-2 h-4 w-4" variant="stroke" />
                {t("gabinet.documents.documents")}
              </TabsTrigger>
              <TabsTrigger value="payments">
                <CreditCard className="mr-2 h-4 w-4" variant="stroke" />
                {t("gabinet.payments.payments")}
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="mr-2 h-4 w-4" variant="stroke" />
                {t("gabinet.patients.history")}
              </TabsTrigger>
              <TabsTrigger value="notes">
                <StickyNote className="mr-2 h-4 w-4" variant="stroke" />
                {t("common.notes")}
              </TabsTrigger>
              <TabsTrigger value="body-chart">{t("gabinet.appointments.tabs.bodyChart")}</TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[calc(100vh-320px)] mt-4">
              {/* Details Tab */}
              <TabsContent value="details" className="m-0 space-y-4">
                {/* Treatment Info Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" variant="stroke" />
                      {t("gabinet.treatments.treatment")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("common.name")}</span>
                      <span className="font-medium">{treatment?.name ?? "-"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("gabinet.treatments.duration")}</span>
                      <span className="font-medium">{calculateDuration()} min</span>
                    </div>
                    {treatment?.price !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t("common.price")}</span>
                        <span className="font-medium">
                          {treatment.price.toFixed(2)} {treatment.currency ?? "PLN"}
                        </span>
                      </div>
                    )}
                    {treatment?.description && (
                      <div className="pt-2">
                        <span className="text-sm text-muted-foreground">{t("common.description")}</span>
                        <p className="text-sm mt-1">{treatment.description}</p>
                      </div>
                    )}
                    {treatment?.contraindications && (
                      <div className="pt-2 p-3 bg-destructive/10 rounded-lg">
                        <div className="flex items-center gap-2 text-destructive mb-1">
                          <ShieldAlert className="h-4 w-4" variant="stroke" />
                          <span className="text-sm font-medium">{t("gabinet.treatments.contraindications")}</span>
                        </div>
                        <p className="text-sm">{treatment.contraindications}</p>
                      </div>
                    )}
                    {treatment?.aftercare && (
                      <div className="pt-2 p-3 bg-primary/10 rounded-lg">
                        <div className="flex items-center gap-2 text-primary mb-1">
                          <Heart className="h-4 w-4" variant="stroke" />
                          <span className="text-sm font-medium">{t("gabinet.treatments.aftercare")}</span>
                        </div>
                        <p className="text-sm">{treatment.aftercare}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Employee Info Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserCircle className="h-4 w-4" variant="stroke" />
                      {t("gabinet.employees.employee")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback>{getEmployeeInitials()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{getEmployeeName()}</p>
                        <p className="text-sm text-muted-foreground">{employee?.email}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Scheduling Info Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" variant="stroke" />
                      {t("gabinet.appointments.scheduling")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("common.date")}</span>
                      <span className="font-medium">{formatDate(appointment.date)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("common.time")}</span>
                      <span className="font-medium">
                        {formatTime(appointment.startTime)} - {formatTime(appointment.endTime)} ({calculateDuration()} min)
                      </span>
                    </div>
                    {appointment.isRecurring && appointment.recurringGroupId && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <RefreshCcw className="h-3 w-3" variant="stroke" />
                          {t("gabinet.appointments.recurring")}
                        </span>
                        <Badge variant="outline">{appointment.recurringRule?.frequency ?? "weekly"}</Badge>
                      </div>
                    )}
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("common.createdAt")}</span>
                      <span className="text-sm">{formatDateTime(appointment.createdAt)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Prepayment Status Card */}
                {appointment.prepaymentRequired && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" variant="stroke" />
                        {t("gabinet.appointments.prepayment")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t("gabinet.appointments.prepaymentAmount")}</span>
                        <span className="font-medium">
                          {(appointment.prepaymentAmount ?? 0).toFixed(2)} PLN
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t("common.status")}</span>
                        <Badge variant="secondary">{t("gabinet.appointments.prepaymentPending")}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Internal Notes Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <StickyNote className="h-4 w-4" variant="stroke" />
                      {t("gabinet.appointments.internalNotes")}
                    </CardTitle>
                    <CardDescription>{t("gabinet.appointments.internalNotesDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      placeholder={t("gabinet.appointments.internalNotesPlaceholder")}
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      rows={4}
                    />
                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleSaveInternalNotes} disabled={isSavingNotes}>
                        {isSavingNotes ? t("common.saving") : t("common.save")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="m-0">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>{t("gabinet.documents.documents")}</CardTitle>
                      <CardDescription>{t("gabinet.documents.linkedToAppointment")}</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => { resetDocForm(); setDocPanelOpen(true); }}>
                      <Plus className="mr-2 h-4 w-4" variant="stroke" />
                      {t("gabinet.documents.newDocument")}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {documents.length === 0 ? (
                      <EmptyState
                        icon={<FileText className="h-12 w-12" variant="stroke" />}
                        title={t("gabinet.documents.noDocuments")}
                        description={t("gabinet.documents.noDocumentsDesc")}
                        action={
                          <Button onClick={() => { resetDocForm(); setDocPanelOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" variant="stroke" />
                            {t("gabinet.documents.createFirst")}
                          </Button>
                        }
                      />
                    ) : (
                      <div className="border rounded-lg">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left p-3 text-sm font-medium">{t("common.title")}</th>
                              <th className="text-left p-3 text-sm font-medium">{t("common.type")}</th>
                              <th className="text-left p-3 text-sm font-medium">{t("common.status")}</th>
                              <th className="text-left p-3 text-sm font-medium">{t("common.date")}</th>
                              <th className="text-right p-3 text-sm font-medium">{t("common.actions")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {documents.map((doc) => (
                              <tr key={doc._id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="p-3">
                                  <p className="font-medium">{doc.title}</p>
                                </td>
                                <td className="p-3">
                                  <Badge variant="outline">{t(`gabinet.documents.types.${doc.type}`)}</Badge>
                                </td>
                                <td className="p-3">
                                  <Badge variant={doc.status === "signed" ? "success" : doc.status === "final" ? "default" : "secondary"}>
                                    {t(`gabinet.documents.status.${doc.status}`)}
                                  </Badge>
                                </td>
                                <td className="p-3 text-sm text-muted-foreground">
                                  {new Date(doc.createdAt).toLocaleDateString("pl-PL")}
                                </td>
                                <td className="p-3">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => setViewDocId(doc._id)}>
                                      <Eye className="h-4 w-4" variant="stroke" />
                                    </Button>
                                    {doc.status !== "signed" && (
                                      <Button variant="ghost" size="sm" onClick={() => openEditDoc(doc)}>
                                        <Pencil className="h-4 w-4" variant="stroke" />
                                      </Button>
                                    )}
                                    {doc.requiresSignature && doc.status !== "signed" && (
                                      <Button variant="ghost" size="sm" onClick={() => handleRequestSignature(doc._id)}>
                                        <PenTool className="h-4 w-4" variant="stroke" />
                                      </Button>
                                    )}
                                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleArchiveDoc(doc._id)}>
                                      <Trash2 className="h-4 w-4" variant="stroke" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Payments Tab */}
              <TabsContent value="payments" className="m-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("gabinet.payments.payments")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {payments.length === 0 ? (
                      <p className="text-muted-foreground">{t("common.noResults")}</p>
                    ) : (
                      <div className="space-y-2">
                        {payments.map((payment) => (
                          <div key={payment._id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <p className="font-medium">
                                {payment.amount.toFixed(2)} {payment.currency ?? "PLN"}
                              </p>
                              <p className="text-sm text-muted-foreground">{payment.method}</p>
                            </div>
                            <Badge variant={payment.status === "completed" ? "success" : "secondary"}>
                              {payment.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* History Tab */}
              <TabsContent value="history" className="m-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("gabinet.patients.history")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {patientHistory.length === 0 ? (
                      <p className="text-muted-foreground">{t("common.noResults")}</p>
                    ) : (
                      <div className="space-y-2">
                        {patientHistory.map((appt) => (
                          <div key={appt._id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <p className="font-medium">{(appt as any).treatment?.name ?? "-"}</p>
                              <p className="text-sm text-muted-foreground">
                                {formatDate(appt.date)} • {formatTime(appt.startTime)}
                              </p>
                            </div>
                            <Badge variant={statusColors[appt.status] ?? "secondary"}>{appt.status}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Notes Tab */}
              <TabsContent value="notes" className="m-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("common.notes")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {notes.length === 0 ? (
                      <p className="text-muted-foreground">{t("common.noResults")}</p>
                    ) : (
                      <div className="space-y-3">
                        {notes.map((note) => (
                          <div key={note._id} className="p-3 border rounded-lg">
                            <p className="text-sm">{note.content}</p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {new Date(note.createdAt).toLocaleString("pl-PL")}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Body Chart Tab */}
              <TabsContent value="body-chart" className="m-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("gabinet.appointments.tabs.bodyChart")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{t("common.comingSoon")}</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("gabinet.appointments.cancelTitle")}</DialogTitle>
            <DialogDescription>{t("gabinet.appointments.cancelDesc")}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder={t("gabinet.appointments.cancelReasonPlaceholder")}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleCancelConfirm} disabled={isUpdating}>
              {isUpdating ? t("common.processing") : t("gabinet.appointments.actions.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Panel */}
      <SidePanel open={docPanelOpen} onOpenChange={setDocPanelOpen} title={editingDocId ? t("gabinet.documents.editDocument") : t("gabinet.documents.newDocument")}>
        <div className="space-y-4 p-4">
          <div>
            <Label>{t("common.title")}</Label>
            <Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder={t("gabinet.documents.titlePlaceholder")} />
          </div>

          <div>
            <Label>{t("common.type")}</Label>
            <Select value={docType} onValueChange={setDocType} disabled={!!editingDocId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="consent">{t("gabinet.documents.types.consent")}</SelectItem>
                <SelectItem value="prescription">{t("gabinet.documents.types.prescription")}</SelectItem>
                <SelectItem value="referral">{t("gabinet.documents.types.referral")}</SelectItem>
                <SelectItem value="report">{t("gabinet.documents.types.report")}</SelectItem>
                <SelectItem value="invoice">{t("gabinet.documents.types.invoice")}</SelectItem>
                <SelectItem value="other">{t("gabinet.documents.types.other")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!editingDocId && templates && templates.length > 0 && (
            <div>
              <Label>{t("gabinet.documents.fromTemplate")}</Label>
              <Select value={docTemplateId} onValueChange={setDocTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("gabinet.documents.selectTemplate")} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((tpl: any) => (
                    <SelectItem key={tpl._id} value={tpl._id}>{tpl.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>{t("gabinet.documents.content")}</Label>
            <Textarea
              value={docContent}
              onChange={(e) => setDocContent(e.target.value)}
              placeholder={t("gabinet.documents.contentPlaceholder")}
              rows={10}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setDocPanelOpen(false); resetDocForm(); }}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleDocSubmit} disabled={isDocSubmitting}>
              {isDocSubmitting ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </SidePanel>

      {/* Document Viewer Dialog */}
      <Dialog open={!!viewDocId} onOpenChange={() => setViewDocId(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{documents.find(d => d._id === viewDocId)?.title}</DialogTitle>
          </DialogHeader>
          {viewDocId && (
            <DocumentViewer documentId={viewDocId} organizationId={organizationId} />
          )}
          <DialogFooter>
            {(() => {
              const doc = documents.find(d => d._id === viewDocId);
              if (doc?.requiresSignature && doc.status !== "signed") {
                return (
                  <Button onClick={() => { setViewDocId(null); setSignDocId(doc._id); }}>
                    <PenTool className="mr-2 h-4 w-4" variant="stroke" />
                    {t("gabinet.documents.sign")}
                  </Button>
                );
              }
              return null;
            })()}
            <Button variant="outline" onClick={() => setViewDocId(null)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signature Dialog */}
      <Dialog open={!!signDocId} onOpenChange={() => setSignDocId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("gabinet.documents.signDocument")}</DialogTitle>
            <DialogDescription>{t("gabinet.documents.signDescription")}</DialogDescription>
          </DialogHeader>
          <SignaturePad onSave={handleSign} onCancel={() => setSignDocId(null)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
