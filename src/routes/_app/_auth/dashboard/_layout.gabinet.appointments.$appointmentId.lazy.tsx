import { useState, useEffect } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { EntityDetailLayout } from "@/components/crm/entity-detail-layout";
import { ActivityTimeline } from "@/components/activity-timeline/activity-timeline";
import { mergeTimelineSources } from "@/components/activity-timeline/merge-timeline-sources";
import type { SmsEventEntry, AutomationRunEntry, TimelineSourceEntry } from "@/components/activity-timeline/merge-timeline-sources";
import { AppointmentDocumentChecklist, useAppointmentDocumentCounts } from "@/components/documents/appointment-document-checklist";
import { DocumentGateDialog } from "@/components/documents/document-gate-dialog";
import { BodyChart, type BodyRegion } from "@/components/gabinet/BodyChart";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Calendar,
  Clock,
  Mail,
  Phone,
  CreditCard,
  Package,
  History,
  StickyNote,
  Activity,
  UserCircle,
  DollarSign,
  RefreshCcw,
  Info,
  Sparkles,
  ShieldAlert,
  Heart,
  Plus,
  Eye,
  Pencil,
  Trash2,
  Star,
  MoreHorizontal,
  MessageSquare,
  Send,
  Inbox,
} from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";

export const Route = createLazyFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/appointments/$appointmentId",
)({
  component: AppointmentDetail,
});

const statusColors: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending_confirmation: "outline",
  scheduled: "secondary",
  confirmed: "default",
  in_progress: "default",
  completed: "default",
  cancelled: "destructive",
  no_show: "destructive",
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending_confirmation: ["scheduled", "confirmed", "cancelled"],
  scheduled: ["confirmed", "cancelled", "no_show"],
  confirmed: ["in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

function getSmsSummary(events: Array<Record<string, unknown>>, appointmentStatus: string) {
  const latestOutbound = events.find(
    (event) =>
      event.direction === "outbound" &&
      event.eventType === "appointment_confirmation_request",
  );
  const latestInbound = events.find(
    (event) =>
      event.direction === "inbound" &&
      event.eventType === "appointment_confirmation_reply",
  );

  if (latestInbound) {
    if (latestInbound.processingStatus === "processed") {
      if (latestInbound.parsedIntent === "confirm") {
        return { labelKey: "gabinet.appointmentDetail.sms.summaryConfirmed", tone: "default" as const };
      }
      if (latestInbound.parsedIntent === "cancel") {
        return { labelKey: "gabinet.appointmentDetail.sms.summaryCancelled", tone: "destructive" as const };
      }
    }

    if (latestInbound.processingStatus === "failed") {
      return { labelKey: "gabinet.appointmentDetail.sms.summaryFailed", tone: "destructive" as const };
    }

    return { labelKey: "gabinet.appointmentDetail.sms.summaryIgnored", tone: "secondary" as const };
  }

  if (latestOutbound) {
    if (latestOutbound.processingStatus === "failed") {
      return { labelKey: "gabinet.appointmentDetail.sms.summaryFailed", tone: "destructive" as const };
    }
    if (latestOutbound.processingStatus === "pending") {
      return { labelKey: "gabinet.appointmentDetail.sms.summaryQueued", tone: "outline" as const };
    }
    return { labelKey: "gabinet.appointmentDetail.sms.summarySent", tone: "secondary" as const };
  }

  if (appointmentStatus === "pending_confirmation") {
    return { labelKey: "gabinet.appointmentDetail.sms.summaryAwaitingRequest", tone: "outline" as const };
  }

  return { labelKey: "gabinet.appointmentDetail.sms.summaryNoHistory", tone: "secondary" as const };
}

function getPackageUsageTotals(pkg: Record<string, unknown>) {
  const treatmentsUsed = Array.isArray(pkg?.treatmentsUsed)
    ? pkg.treatmentsUsed
    : [];

  return treatmentsUsed.reduce(
    (acc: { used: number; total: number }, treatment: Record<string, unknown>) => {
      const usedCount = Number(treatment?.usedCount ?? 0);
      const totalCount = Number(treatment?.totalCount ?? 0);
      return {
        used: acc.used + (Number.isFinite(usedCount) ? usedCount : 0),
        total: acc.total + (Number.isFinite(totalCount) ? totalCount : 0),
      };
    },
    { used: 0, total: 0 },
  );
}

// Note Item Component
function NoteItem({
  note,
  isEditing,
  editContent,
  onEditContentChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onTogglePin,
  onReply,
  isSubmitting,
  isReply = false,
}: {
  note: Record<string, unknown>;
  isEditing: boolean;
  editContent: string;
  onEditContentChange: (content: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onReply: () => void;
  isSubmitting: boolean;
  isReply?: boolean;
}) {
  const { t, i18n } = useTranslation();

  return (
    <div
      className={`p-3 border rounded-lg ${note.isPinned ? "bg-primary/5 border-primary/20" : ""} ${isReply ? "bg-muted/30" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback>?</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">
              {(note.authorName as string) ?? t("common.unknown")}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(note.createdAt as number).toLocaleString(i18n.language)}
            </p>
          </div>
        </div>
        {!!note.isPinned && (
          <Badge variant="outline" className="text-xs">
            {t("gabinet.notes.pinned")}
          </Badge>
        )}
      </div>

      {isEditing ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={editContent}
            onChange={(e) => onEditContentChange(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancelEdit}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={onSaveEdit} disabled={isSubmitting}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm mt-2 whitespace-pre-wrap">{note.content as string}</p>
          <div className="flex items-center gap-1 mt-3">
            <Button variant="ghost" size="sm" onClick={onReply}>
              {t("gabinet.notes.reply")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onStartEdit}>
              <Pencil className="h-3 w-3" variant="stroke" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onTogglePin}>
              {note.isPinned
                ? t("gabinet.notes.unpin")
                : t("gabinet.notes.pin")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" variant="stroke" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function AppointmentDetail() {
  const { appointmentId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [internalNotes, setInternalNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);


  // Payment management state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [paymentNote, setPaymentNote] = useState("");
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);

  // Body chart state
  const [bodyChartData, setBodyChartData] = useState<BodyRegion[]>([]);
  const [isBodyChartSaving, setIsBodyChartSaving] = useState(false);
  const [bodyChartModalOpen, setBodyChartModalOpen] = useState(false);

  // Package usage dialog state
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [usageDialogPkgId, setUsageDialogPkgId] = useState<string | null>(null);
  const [usageDialogItems, setUsageDialogItems] = useState<
    Array<{ treatmentId: string; treatmentName: string; remaining: number; qty: number }>
  >([]);
  const [isUsageSubmitting, setIsUsageSubmitting] = useState(false);

  // Document gate state
  const [gateDialogOpen, setGateDialogOpen] = useState(false);
  const [gateTiming, setGateTiming] = useState<"before_start" | "after_completion">("before_start");
  const [gateTargetStatus, setGateTargetStatus] = useState<string>("");

  const updateStatus = useMutation(api.gabinet.appointments.updateStatus);
  const updateAppointment = useMutation(api.gabinet.appointments.update);
  const trackView = useMutation(api.recentlyViewed.track);

  // Payment mutations
  const createPayment = useMutation(api.payments.create);

  // Note mutations
  const createNote = useMutation(api.notes.create);
  const updateNote = useMutation(api.notes.update);
  const deleteNote = useMutation(api.notes.remove);
  const togglePinNote = useMutation(api.notes.togglePin);

  // Package usage mutation
  const usePackageTreatmentsBatch = useMutation(api.gabinet.packages.usePackageTreatmentsBatch);

  // Note state
  const [newNoteContent, setNewNoteContent] = useState("");
  const [replyToNoteId, setReplyToNoteId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState("");
  const [isNoteSubmitting, setIsNoteSubmitting] = useState(false);

  const {
    data: detail,
    isLoading,
    refetch,
  } = useQuery(
    convexQuery(api.gabinet.appointments.getFullDetail, {
      organizationId,
      appointmentId: appointmentId as Id<"gabinetAppointments">,
    }),
  );

  const { data: smsEvents = [] } = useQuery(
    convexQuery(api.gabinet.appointmentSms.listByAppointment, {
      organizationId,
      appointmentId: appointmentId as Id<"gabinetAppointments">,
    }),
  );

  const { data: activitiesData } = useQuery(
    convexQuery(api.activities.getForEntity, {
      organizationId,
      entityType: "gabinetAppointment",
      entityId: appointmentId,
      paginationOpts: { numItems: 50, cursor: null },
    }),
  );
  const activities = activitiesData?.page;

  const { data: automationRuns = [] } = useQuery(
    convexQuery(api.automation.listEntityRuns, {
      organizationId,
      entityType: "gabinetAppointment",
      entityId: appointmentId,
    }),
  );

  // Initialize internal notes from appointment data
  useEffect(() => {
    if (detail?.appointment.internalNotes) {
      setInternalNotes(detail.appointment.internalNotes);
    }
  }, [detail?.appointment.internalNotes]);

  // Initialize body chart data from appointment
  useEffect(() => {
    if (detail?.appointment.bodyChartData) {
      try {
        setBodyChartData(JSON.parse(detail.appointment.bodyChartData));
      } catch {
        // Ignore parse errors
      }
    }
  }, [detail?.appointment.bodyChartData]);

  // Track recently viewed
  useEffect(() => {
    if (detail && organizationId) {
      const label = `${detail.treatment?.name ?? t("gabinet.appointments.appointment")} - ${detail.patient?.firstName ?? ""} ${detail.patient?.lastName ?? ""}`.trim();
      trackView({ organizationId, entityType: "gabinetAppointments", entityId: appointmentId, entityLabel: label });
    }
  }, [detail?.appointment._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push patient & appointment info into sidebar slot
  const { setContent: setSidebarContent } = useSidebarSlot();
  useEffect(() => {
    if (!detail) return;
    const {
      appointment: appt,
      patient: pat,
      treatment: treat,
      employee: emp,
      documents: docs,
      payments: pays,
      notes: nts,
      patientHistory: hist,
      loyaltyBalance: loyBal,
      loyaltyTier: loyTier,
    } = detail;
    const getInitials = () => {
      if (pat?.firstName && pat?.lastName)
        return `${pat.firstName[0]}${pat.lastName[0]}`;
      return "?";
    };
    const fmtDate = (d: string) => new Date(d).toLocaleDateString(i18n.language);
    const fmtTime = (t: string) => t?.substring(0, 5) ?? "";
    const empName = emp
      ? emp.name ?? emp.email
      : "-";

    setSidebarContent(
      <div className="space-y-3">
        <Card className="border-purple-200/50 dark:border-purple-800/30">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <Avatar className="h-9 w-9 bg-purple-100 dark:bg-purple-900/50">
                <AvatarFallback className="text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <p className="text-sm font-semibold">
                {pat?.firstName} {pat?.lastName}
              </p>
            </div>
            <Separator />
            {pat?.phone && (
              <p className="text-xs flex items-center gap-1.5">
                <Phone
                  size={12}
                  className="text-muted-foreground"
                  variant="stroke"
                />
                {pat.phone}
              </p>
            )}
            {pat?.email && (
              <>
                <Separator />
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Mail size={12} variant="stroke" />
                  {pat.email}
                </p>
              </>
            )}
            {loyBal > 0 && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-xs">
                      <Star size={10} variant="stroke" className="mr-1" />
                      {loyBal} {t("gabinet.loyalty.points")}
                    </Badge>
                    {loyTier && (
                      <span className="text-xs text-muted-foreground">
                        {loyTier}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {t(
                      "gabinet.loyalty.programDescription",
                      "Program lojalnościowy — punkty za wizyty",
                    )}
                  </p>
                </div>
              </>
            )}
            <Separator />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-xs h-7 px-2"
                >
                  {t("gabinet.patients.actions", "Akcje klienta")}
                  <MoreHorizontal size={14} variant="stroke" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem asChild>
                  <Link
                    to="/dashboard/gabinet/patients/$patientId"
                    params={{ patientId: pat?._id ?? "" }}
                  >
                    <Eye size={14} variant="stroke" className="mr-2" />
                    {t("gabinet.patients.viewProfile", "Profil klienta")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    to="/dashboard/gabinet/patients/$patientId"
                    params={{ patientId: pat?._id ?? "" }}
                    search={{ tab: "history" }}
                  >
                    <History size={14} variant="stroke" className="mr-2" />
                    {t("gabinet.patients.history", "Historia wizyt")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {pat?.phone && (
                  <DropdownMenuItem asChild>
                    <a href={`tel:${pat.phone}`}>
                      <Phone size={14} variant="stroke" className="mr-2" />
                      {t("common.call", "Zadzwoń")}
                    </a>
                  </DropdownMenuItem>
                )}
                {pat?.email && (
                  <DropdownMenuItem asChild>
                    <a href={`mailto:${pat.email}`}>
                      <Mail size={14} variant="stroke" className="mr-2" />
                      {t("common.sendEmail", "Wyślij e-mail")}
                    </a>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>

        <Card className="border-cyan-200/50 dark:border-cyan-800/30">
          <CardHeader className="pb-3 bg-gradient-to-r from-cyan-50 to-teal-50 dark:from-cyan-950/30 dark:to-teal-950/30 rounded-t-lg">
            <CardTitle className="text-sm flex items-center gap-2 text-cyan-700 dark:text-cyan-300">
              <Calendar size={16} variant="stroke" className="text-cyan-500" />
              {t("gabinet.appointments.details")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("gabinet.treatments.treatment")}
              </span>
              <span className="font-medium text-xs">{treat?.name ?? "-"}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock size={10} variant="stroke" />
                {t("common.date")}
              </span>
              <span className="font-medium text-xs">{fmtDate(appt.date)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("common.time")}</span>
              <span className="font-medium text-xs">
                {fmtTime(appt.startTime)} - {fmtTime(appt.endTime)}
              </span>
            </div>
            <Separator />
            <div>
              <span className="text-muted-foreground flex items-center gap-1">
                <UserCircle size={10} variant="stroke" />
                {t("gabinet.employees.employee")}
              </span>
              <p className="font-medium text-xs mt-0.5">{empName}</p>
            </div>
            {treat?.price !== undefined && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("common.price")}
                  </span>
                  <span className="font-medium text-xs">
                    {treat.price.toFixed(2)} {treat.currency ?? "PLN"}
                  </span>
                </div>
              </>
            )}
            {(appt.status === "completed" || appt.status === "cancelled") &&
              appt.updatedAt && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {appt.status === "completed"
                        ? t("gabinet.appointments.completedAt", "Zakończono")
                        : t("gabinet.appointments.cancelledAt", "Anulowano")}
                    </span>
                    <span className="font-medium text-xs">
                      {new Date(appt.updatedAt).toLocaleString(i18n.language)}
                    </span>
                  </div>
                </>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2 rounded-md bg-muted/50">
                <p className="text-lg font-bold">{docs.length}</p>
                <p className="text-[10px] text-muted-foreground">
                  {t("gabinet.documents.documents")}
                </p>
              </div>
              <div className="p-2 rounded-md bg-muted/50">
                <p className="text-lg font-bold">{pays.length}</p>
                <p className="text-[10px] text-muted-foreground">
                  {t("gabinet.payments.payments")}
                </p>
              </div>
              <div className="p-2 rounded-md bg-muted/50">
                <p className="text-lg font-bold">{nts.length}</p>
                <p className="text-[10px] text-muted-foreground">
                  {t("common.notes")}
                </p>
              </div>
              <div className="p-2 rounded-md bg-muted/50">
                <p className="text-lg font-bold">{hist.length}</p>
                <p className="text-[10px] text-muted-foreground">
                  {t("gabinet.patients.history")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>,
    );
    return () => setSidebarContent(null);
  }, [detail, t, setSidebarContent]);

  if (!detail && !isLoading) {
    return (
      <EntityDetailLayout
        variant="sidebar-slot"
        notFound
        onBack={() => navigate({ to: "/dashboard/gabinet/calendar" })}
        title=""
        fields={[]}
        tabs={[]}
      />
    );
  }

  if (isLoading || !detail) {
    return (
      <EntityDetailLayout
        variant="sidebar-slot"
        isLoading
        title=""
        fields={[]}
        tabs={[]}
      />
    );
  }

  const {
    appointment,
    patient,
    treatment,
    employee,
    payments,
    notes,
    patientPackageUsage,
    patientHistory,
    loyaltyBalance,
    loyaltyTier,
    loyaltyTransactions,
    allPatientPayments,
  } = detail;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatTime = (time: string) => {
    return time.slice(0, 5);
  };

  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(i18n.language);
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
    return name
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const calculateDuration = () => {
    const [startH, startM] = appointment.startTime.split(":").map(Number);
    const [endH, endM] = appointment.endTime.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return endMinutes - startMinutes;
  };

  // Document counts for gate checks and status badges
  const docCounts = useAppointmentDocumentCounts(appointmentId, organizationId);

  const performStatusChange = async (newStatus: string) => {
    setIsUpdating(true);
    try {
      await updateStatus({
        organizationId,
        appointmentId: appointment._id,
        status: newStatus as "scheduled" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show" | "pending_confirmation",
      });
      toast.success(t("gabinet.appointments.statusUpdated"));
      refetch();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === "cancelled") {
      setCancelDialogOpen(true);
      return;
    }

    // Document gate: check before transitioning to in_progress or completed
    if (newStatus === "in_progress" && docCounts.missingBefore > 0) {
      setGateTiming("before_start");
      setGateTargetStatus(newStatus);
      setGateDialogOpen(true);
      return;
    }
    if (newStatus === "completed" && docCounts.missingAfter > 0) {
      setGateTiming("after_completion");
      setGateTargetStatus(newStatus);
      setGateDialogOpen(true);
      return;
    }

    await performStatusChange(newStatus);
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Payment handlers
  const handleCreatePayment = async () => {
    if (!paymentAmount || isNaN(parseFloat(paymentAmount))) {
      toast.error(t("gabinet.payments.amountRequired"));
      return;
    }

    setIsPaymentSubmitting(true);
    try {
      await createPayment({
        organizationId,
        patientId: patient!._id,
        appointmentId: appointment._id,
        amount: parseFloat(paymentAmount),
        currency: "PLN",
        paymentMethod: paymentMethod as "cash" | "card" | "transfer" | "other",
        notes: paymentNote || undefined,
      });

      toast.success(t("gabinet.payments.created"));
      setPaymentDialogOpen(false);
      setPaymentAmount("");
      setPaymentNote("");
      refetch();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    } finally {
      setIsPaymentSubmitting(false);
    }
  };

  // Note handlers
  const handleCreateNote = async () => {
    if (!newNoteContent.trim()) return;

    setIsNoteSubmitting(true);
    try {
      await createNote({
        organizationId,
        entityType: "gabinetAppointment",
        entityId: appointment._id,
        content: newNoteContent.trim(),
        parentNoteId: replyToNoteId
          ? (replyToNoteId as Id<"notes">)
          : undefined,
      });
      toast.success(t("gabinet.notes.created"));
      setNewNoteContent("");
      setReplyToNoteId(null);
      refetch();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    } finally {
      setIsNoteSubmitting(false);
    }
  };

  const handleUpdateNote = async (noteId: Id<"notes">) => {
    if (!editNoteContent.trim()) return;

    setIsNoteSubmitting(true);
    try {
      await updateNote({
        organizationId,
        noteId,
        content: editNoteContent.trim(),
      });
      toast.success(t("common.saved"));
      setEditingNoteId(null);
      setEditNoteContent("");
      refetch();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    } finally {
      setIsNoteSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId: Id<"notes">) => {
    if (!confirm(t("common.confirmDelete"))) return;

    try {
      await deleteNote({ organizationId, noteId });
      toast.success(t("common.deleted"));
      refetch();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    }
  };

  const handleTogglePin = async (noteId: Id<"notes">) => {
    try {
      await togglePinNote({ organizationId, noteId });
      refetch();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    }
  };

  const startEditNote = (note: Record<string, unknown>) => {
    setEditingNoteId(note._id as string);
    setEditNoteContent(note.content as string);
  };

  // Body chart handlers
  const handleBodyChartChange = (data: BodyRegion[]) => {
    setBodyChartData(data);
  };

  const handleBodyChartSave = async () => {
    setIsBodyChartSaving(true);
    try {
      await updateAppointment({
        organizationId,
        appointmentId: appointment._id,
        bodyChartData:
          bodyChartData.length > 0 ? JSON.stringify(bodyChartData) : undefined,
      });
      toast.success(t("common.saved"));
      refetch();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    } finally {
      setIsBodyChartSaving(false);
    }
  };

  // Group notes by parent for threading
  const rootNotes = notes.filter((n: Record<string, unknown>) => !n.parentNoteId);
  const getReplies = (noteId: string) =>
    notes.filter((n: Record<string, unknown>) => n.parentNoteId === noteId);

  // Calculate payment summary
  const treatmentPrice = treatment?.price ?? 0;
  const totalPaid = payments
    .filter((p: Record<string, unknown>) => p.status === "completed")
    .reduce((sum: number, p: Record<string, unknown>) => sum + (p.amount as number), 0);
  const outstanding = treatmentPrice - totalPaid;

  const availableTransitions = VALID_TRANSITIONS[appointment.status] ?? [];
  const latestOutboundSms = smsEvents.find(
    (event: Record<string, unknown>) =>
      event.direction === "outbound" &&
      event.eventType === "appointment_confirmation_request",
  );
  const latestInboundSms = smsEvents.find(
    (event: Record<string, unknown>) =>
      event.direction === "inbound" &&
      event.eventType === "appointment_confirmation_reply",
  );
  const smsSummary = getSmsSummary(smsEvents as Array<Record<string, unknown>>, appointment.status);

  // Build merged timeline using mergeTimelineSources
  const mergedTimeline = mergeTimelineSources({
    activities: (activities ?? []).map((a: Record<string, unknown>) => ({
      _id: a._id as string,
      action: a.action as string,
      description: a.description as string,
      createdAt: a.createdAt as number,
      performedByName: a.performedByName as string | undefined,
      metadata: a.metadata,
    })) as TimelineSourceEntry[],
    smsEvents: smsEvents.map((e: Record<string, unknown>) => ({
      _id: e._id as string,
      direction: e.direction as "outbound" | "inbound",
      messageBody: e.rawBody as string | undefined,
      createdAt: e.createdAt as number,
      status: e.processingStatus as string | undefined,
      parsedIntent: e.parsedIntent as string | undefined,
    })) as SmsEventEntry[],
    automationRuns: automationRuns.map((r: Record<string, unknown>) => ({
      _id: r._id as string,
      ruleName: r.ruleName as string | undefined,
      status: r.status as string,
      createdAt: r.createdAt as number,
      actionsSummary: r.actionsSummary as string | undefined,
    })) as AutomationRunEntry[],
  });

  // Header title and subtitle
  const headerTitle = `${treatment?.name ?? t("gabinet.appointments.appointment")} - ${patient?.firstName ?? ""} ${patient?.lastName ?? ""}`.trim();
  const headerSubtitle = (
    <span>
      {formatDate(appointment.date)} &bull; {formatTime(appointment.startTime)} - {formatTime(appointment.endTime)}
    </span>
  );

  // Helper: document badge count for status transitions
  const getDocBadgeCount = (status: string): number => {
    if (status === "in_progress") return docCounts.missingBefore;
    if (status === "completed") return docCounts.missingAfter;
    return 0;
  };

  // Status dropdown as actions menu
  const statusAction = availableTransitions.length > 0 ? (
    <Select
      value={appointment.status}
      onValueChange={(value) => handleStatusChange(value)}
      disabled={isUpdating}
    >
      <SelectTrigger className="w-auto gap-2">
        <Badge
          variant={statusColors[appointment.status] ?? "secondary"}
          className="text-sm"
        >
          {t(`gabinet.appointments.statuses.${appointment.status}`)}
        </Badge>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={appointment.status} disabled>
          {t(`gabinet.appointments.statuses.${appointment.status}`)}
        </SelectItem>
        {availableTransitions.map((status) => {
          const docBadge = getDocBadgeCount(status);
          return (
            <SelectItem key={status} value={status}>
              <span className="flex items-center gap-2">
                {t(`gabinet.appointments.statuses.${status}`)}
                {docBadge > 0 && (
                  <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 text-xs font-bold rounded-full bg-destructive text-destructive-foreground">
                    {docBadge}
                  </span>
                )}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  ) : (
    <Badge
      variant={statusColors[appointment.status] ?? "secondary"}
      className="text-sm"
    >
      {t(`gabinet.appointments.statuses.${appointment.status}`)}
    </Badge>
  );

  // Breadcrumbs
  const breadcrumbsContent = (
    <nav className="flex items-center gap-2 text-sm text-muted-foreground">
      <Link to="/dashboard" className="hover:text-foreground">
        {t("nav.home")}
      </Link>
      <span>/</span>
      <Link
        to="/dashboard/gabinet/calendar"
        className="hover:text-foreground"
      >
        {t("nav.gabinet")} / {t("nav.calendar")}
      </Link>
      <span>/</span>
      <span className="text-foreground">
        {t("gabinet.appointments.appointment")} #{appointment._id.slice(-6)}
      </span>
    </nav>
  );

  // Build tabs array
  const tabs = [
    {
      label: t("gabinet.appointments.tabs.details"),
      content: (
        <div className="space-y-4">
          {/* Treatment Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2.5">
                <Sparkles className="h-4 w-4" variant="stroke" />
                {t("gabinet.treatments.treatment")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("common.name")}
                </span>
                <span className="font-medium">
                  {treatment?.name ?? "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("gabinet.treatments.duration")}
                </span>
                <span className="font-medium">
                  {calculateDuration()} min
                </span>
              </div>
              {treatment?.price !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("common.price")}
                  </span>
                  <span className="font-medium">
                    {treatment.price.toFixed(2)}{" "}
                    {treatment.currency ?? "PLN"}
                  </span>
                </div>
              )}
              {treatment?.description && (
                <div className="pt-2">
                  <span className="text-sm text-muted-foreground">
                    {t("common.description")}
                  </span>
                  <p className="text-sm mt-1">{treatment.description}</p>
                </div>
              )}
              {treatment?.contraindications && (
                <div className="pt-2 p-3 bg-destructive/10 rounded-lg">
                  <div className="flex items-center gap-2 text-destructive mb-1">
                    <ShieldAlert className="h-4 w-4" variant="stroke" />
                    <span className="text-sm font-medium">
                      {t("gabinet.treatments.contraindications")}
                    </span>
                  </div>
                  <p className="text-sm">{treatment.contraindications}</p>
                </div>
              )}
              {!!(treatment as Record<string, unknown>)?.aftercare && (
                <div className="pt-2 p-3 bg-primary/10 rounded-lg">
                  <div className="flex items-center gap-2 text-primary mb-1">
                    <Heart className="h-4 w-4" variant="stroke" />
                    <span className="text-sm font-medium">
                      {t("gabinet.treatments.aftercare")}
                    </span>
                  </div>
                  <p className="text-sm">{(treatment as Record<string, unknown>).aftercare as string}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Employee Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2.5">
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
                  <p className="text-sm text-muted-foreground">
                    {employee?.email}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scheduling Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2.5">
                <Calendar className="h-4 w-4" variant="stroke" />
                {t("gabinet.appointments.scheduling")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("common.date")}
                </span>
                <span className="font-medium">
                  {formatDate(appointment.date)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("common.time")}
                </span>
                <span className="font-medium">
                  {formatTime(appointment.startTime)} -{" "}
                  {formatTime(appointment.endTime)} ({calculateDuration()}{" "}
                  min)
                </span>
              </div>
              {appointment.isRecurring &&
                appointment.recurringGroupId && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <RefreshCcw className="h-3 w-3" variant="stroke" />
                      {t("gabinet.appointments.recurring")}
                    </span>
                    <Badge variant="outline">
                      {appointment.recurringRule?.frequency ?? "weekly"}
                    </Badge>
                  </div>
                )}
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("common.createdAt")}
                </span>
                <span className="text-sm">
                  {formatDateTime(appointment.createdAt)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* SMS Confirmation Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2.5">
                <MessageSquare className="h-4 w-4" variant="stroke" />
                {t("gabinet.appointmentDetail.sms.title")}
              </CardTitle>
              <CardDescription>
                {t("gabinet.appointmentDetail.sms.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={smsSummary.tone}>
                  {t(smsSummary.labelKey)}
                </Badge>
                <Badge variant="outline">
                  {t(`gabinet.appointments.statuses.${appointment.status}`)}
                </Badge>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Send className="h-4 w-4" variant="stroke" />
                    {t("gabinet.appointmentDetail.sms.lastOutbound")}
                  </div>
                  {latestOutboundSms ? (
                    <>
                      <p className="text-sm">{(latestOutboundSms as Record<string, unknown>).rawBody as string}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("gabinet.appointmentDetail.sms.processingStatus")}: {t(`gabinet.appointmentDetail.sms.processingStatuses.${(latestOutboundSms as Record<string, unknown>).processingStatus}`)}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("gabinet.appointmentDetail.sms.noOutbound")}
                    </p>
                  )}
                </div>

                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Inbox className="h-4 w-4" variant="stroke" />
                    {t("gabinet.appointmentDetail.sms.lastInbound")}
                  </div>
                  {latestInboundSms ? (
                    <>
                      <p className="text-sm">{(latestInboundSms as Record<string, unknown>).rawBody as string}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("gabinet.appointmentDetail.sms.parsedIntent")}: {t(`gabinet.appointmentDetail.sms.intents.${(latestInboundSms as Record<string, unknown>).parsedIntent ?? "unknown"}`)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("gabinet.appointmentDetail.sms.processingStatus")}: {t(`gabinet.appointmentDetail.sms.processingStatuses.${(latestInboundSms as Record<string, unknown>).processingStatus}`)}
                      </p>
                      {(latestInboundSms as Record<string, unknown>).processingError && (
                        <p className="text-xs text-muted-foreground">
                          {t("gabinet.appointmentDetail.sms.processingReason")}: {(latestInboundSms as Record<string, unknown>).processingError as string}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("gabinet.appointmentDetail.sms.noInbound")}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Prepayment Status Card */}
          {appointment.prepaymentRequired && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2.5">
                  <DollarSign className="h-4 w-4" variant="stroke" />
                  {t("gabinet.appointments.prepayment")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("gabinet.appointments.prepaymentAmount")}
                  </span>
                  <span className="font-medium">
                    {(appointment.prepaymentAmount ?? 0).toFixed(2)} PLN
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("common.status")}
                  </span>
                  <Badge variant="secondary">
                    {t("gabinet.appointments.prepaymentPending")}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Internal Notes Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2.5">
                <StickyNote className="h-4 w-4" variant="stroke" />
                {t("gabinet.appointments.internalNotes")}
              </CardTitle>
              <CardDescription>
                {t("gabinet.appointments.internalNotesDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder={t(
                  "gabinet.appointments.internalNotesPlaceholder",
                )}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                rows={4}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleSaveInternalNotes}
                  disabled={isSavingNotes}
                >
                  {isSavingNotes ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ),
    },
    {
      label: t("gabinet.payments.payments"),
      count: payments.length,
      content: (
        <div className="space-y-4">
          {/* Payment Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2.5">
                <DollarSign className="h-4 w-4" variant="stroke" />
                {t("gabinet.payments.summary")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {t("gabinet.payments.treatmentPrice")}
                  </p>
                  <p className="text-2xl font-bold">
                    {treatmentPrice.toFixed(2)} PLN
                  </p>
                </div>
                <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {t("gabinet.payments.totalPaid")}
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    {totalPaid.toFixed(2)} PLN
                  </p>
                </div>
                <div
                  className={`text-center p-4 rounded-lg ${outstanding > 0 ? "bg-orange-50 dark:bg-orange-950/20" : "bg-muted/50"}`}
                >
                  <p className="text-sm text-muted-foreground">
                    {t("gabinet.payments.outstanding")}
                  </p>
                  <p
                    className={`text-2xl font-bold ${outstanding > 0 ? "text-orange-600" : "text-green-600"}`}
                  >
                    {outstanding.toFixed(2)} PLN
                  </p>
                </div>
              </div>
              {appointment.prepaymentRequired &&
                appointment.prepaymentAmount && (
                  <div className="mt-4 p-3 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
                    <div className="flex items-center gap-2 text-blue-600">
                      <Info className="h-4 w-4" variant="stroke" />
                      <span className="font-medium">
                        {t("gabinet.appointments.prepaymentRequired")}
                      </span>
                    </div>
                    <p className="text-sm mt-1">
                      {t("gabinet.appointments.prepaymentAmount")}:{" "}
                      {appointment.prepaymentAmount.toFixed(2)} PLN
                    </p>
                  </div>
                )}
            </CardContent>
          </Card>

          {/* Payments Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t("gabinet.payments.payments")}</CardTitle>
                <CardDescription>
                  {t("gabinet.payments.linkedToAppointment")}
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => setPaymentDialogOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" variant="stroke" />
                {t("gabinet.payments.addPayment")}
              </Button>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <EmptyState
                  icon={CreditCard}
                  title={t("gabinet.payments.noPayments")}
                  description={t("gabinet.payments.noPaymentsDesc")}
                  action={
                    <Button onClick={() => setPaymentDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" variant="stroke" />
                      {t("gabinet.payments.addFirst")}
                    </Button>
                  }
                />
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 text-sm font-medium">
                          {t("gabinet.payments.amount")}
                        </th>
                        <th className="text-left p-3 text-sm font-medium">
                          {t("gabinet.payments.method")}
                        </th>
                        <th className="text-left p-3 text-sm font-medium">
                          {t("common.date")}
                        </th>
                        <th className="text-left p-3 text-sm font-medium">
                          {t("common.status")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment: Record<string, unknown>) => (
                        <tr
                          key={payment._id as string}
                          className="border-b last:border-0 hover:bg-muted/30"
                        >
                          <td className="p-3">
                            <p className="font-medium">
                              {(payment.amount as number).toFixed(2)}{" "}
                              {(payment.currency as string) ?? "PLN"}
                            </p>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline">
                              {t(
                                `gabinet.payments.methods.${payment.paymentMethod}`,
                              )}
                            </Badge>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {new Date(
                              payment.createdAt as number,
                            ).toLocaleDateString(i18n.language)}
                          </td>
                          <td className="p-3">
                            <Badge
                              variant={
                                payment.status === "completed"
                                  ? "default"
                                  : payment.status === "refunded"
                                    ? "destructive"
                                    : "secondary"
                              }
                            >
                              {t(
                                `gabinet.payments.status.${payment.status}`,
                              )}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Package Usage Card (if applicable) */}
          {appointment.packageUsageId && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2.5">
                  <Package className="h-4 w-4" variant="stroke" />
                  {t("gabinet.packages.packageUsage")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {t("gabinet.packages.usedInThisAppointment")}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      ),
    },
    {
      label: t("gabinet.patients.history"),
      content: (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2.5">
                <Activity className="h-4 w-4" variant="stroke" />
                {t("detail.tabs.timeline", "Timeline")}
              </CardTitle>
              <CardDescription>
                {t(
                  "gabinet.appointmentDetail.history.unifiedDescription",
                  "Unified operational history for this appointment, including messages and workflow events.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityTimeline
                activities={mergedTimeline}
                maxHeight="400px"
              />
            </CardContent>
          </Card>

          {/* Past Appointments Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2.5">
                <History className="h-4 w-4" variant="stroke" />
                {t("gabinet.patients.appointmentHistory")}
              </CardTitle>
              <CardDescription>
                {t("gabinet.patients.lastAppointments", { count: 20 })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {patientHistory.length === 0 ? (
                <EmptyState
                  icon={Calendar}
                  title={t("gabinet.patients.noHistory")}
                  description={t("gabinet.patients.noHistoryDesc")}
                />
              ) : (
                <div className="relative">
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-4">
                    {patientHistory.map((appt: Record<string, unknown>, index: number) => (
                      <div key={appt._id as string} className="relative flex gap-4">
                        <div className="relative z-10 flex items-center justify-center w-6 h-6 rounded-full bg-background border-2">
                          {index === 0 && (
                            <div className="w-2 h-2 rounded-full bg-primary" />
                          )}
                        </div>
                        <Link
                          to="/dashboard/gabinet/appointments/$appointmentId"
                          params={{ appointmentId: appt._id as string }}
                          className="flex-1 flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div>
                            <p className="font-medium">
                              {((appt as Record<string, unknown>).treatment as Record<string, unknown>)?.name as string ?? "-"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatDate(appt.date as string)} &bull;{" "}
                              {formatTime(appt.startTime as string)} -{" "}
                              {formatTime(appt.endTime as string)}
                            </p>
                          </div>
                          <Badge
                            variant={
                              statusColors[appt.status as string] ?? "secondary"
                            }
                          >
                            {t(
                              `gabinet.appointments.statuses.${appt.status}`,
                            )}
                          </Badge>
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Packages */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2.5">
                <Package className="h-4 w-4" variant="stroke" />
                {t("gabinet.packages.activePackages")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {patientPackageUsage.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title={t("gabinet.packages.noActivePackages")}
                  description={t("gabinet.packages.noActivePackagesDesc")}
                />
              ) : (
                <div className="space-y-3">
                  {patientPackageUsage.map((pkg: Record<string, unknown>) => {
                    const totals = getPackageUsageTotals(pkg);
                    const progressPercent =
                      totals.total > 0
                        ? Math.min((totals.used / totals.total) * 100, 100)
                        : 0;
                    const overallRemainingRatio = totals.total > 0 ? (totals.total - totals.used) / totals.total : 1;
                    let overallBarColor = "bg-emerald-500";
                    if (overallRemainingRatio <= 0) overallBarColor = "bg-red-500";
                    else if (overallRemainingRatio < 0.1) overallBarColor = "bg-red-500";
                    else if (overallRemainingRatio < 0.3) overallBarColor = "bg-amber-500";

                    return (
                      <div key={pkg._id as string} className="p-4 border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">
                            {(pkg.packageName as string) ??
                              t("gabinet.packages.package")}
                          </p>
                          <div className="flex items-center gap-2">
                            {pkg.status === "active" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setUsageDialogPkgId(pkg._id as string);
                                  setUsageDialogItems(
                                    ((pkg.treatmentsUsed as Array<Record<string, unknown>>) ?? [])
                                      .filter((e: Record<string, unknown>) => ((e.usedCount as number) ?? 0) < ((e.totalCount as number) ?? 0))
                                      .map((e: Record<string, unknown>) => ({
                                        treatmentId: e.treatmentId as string,
                                        treatmentName: (e.treatmentName as string) ?? t("gabinet.packages.treatment"),
                                        remaining: ((e.totalCount as number) ?? 0) - ((e.usedCount as number) ?? 0),
                                        qty: 0,
                                      })),
                                  );
                                  setUsageDialogOpen(true);
                                }}
                              >
                                <Plus className="mr-1 h-3.5 w-3.5" variant="stroke" />
                                {t("gabinet.packages.useMultiple")}
                              </Button>
                            )}
                            <Badge
                              variant={
                                pkg.status === "active"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {t(`gabinet.packages.status.${pkg.status}`)}
                            </Badge>
                          </div>
                        </div>

                        {/* Overall progress */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              {t("gabinet.packages.overallProgress")}
                            </span>
                            <span className="tabular-nums">
                              {t("gabinet.packages.completionPercent", { percent: Math.round(progressPercent) })}
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all rounded-full ${overallBarColor}`}
                              style={{
                                width: `${progressPercent}%`,
                              }}
                            />
                          </div>
                        </div>

                        {/* Per-treatment progress bars */}
                        {!!(Array.isArray(pkg.treatmentsUsed) &&
                          (pkg.treatmentsUsed as Array<Record<string, unknown>>).length > 0) && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                {t("gabinet.packages.perTreatmentProgress")}
                              </p>
                              {(pkg.treatmentsUsed as Array<Record<string, unknown>>).map((entry: Record<string, unknown>, index: number) => {
                                const usedCount = (entry.usedCount as number) ?? 0;
                                const totalCount = (entry.totalCount as number) ?? 0;
                                const remaining = totalCount - usedCount;
                                const pct = totalCount > 0 ? Math.round((usedCount / totalCount) * 100) : 0;
                                const remainingRatio = totalCount > 0 ? remaining / totalCount : 1;
                                let barColor = "bg-emerald-500";
                                let statusLabel = t("gabinet.packages.plentyRemaining");
                                if (remainingRatio <= 0) { barColor = "bg-red-500"; statusLabel = t("gabinet.packages.fullyUsed"); }
                                else if (remainingRatio < 0.1) { barColor = "bg-red-500"; statusLabel = t("gabinet.packages.almostExhausted"); }
                                else if (remainingRatio < 0.3) { barColor = "bg-amber-500"; statusLabel = t("gabinet.packages.runningLow"); }

                                return (
                                  <div key={`${pkg._id}-${(entry.treatmentId as string) ?? index}`} className="space-y-1">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="truncate max-w-[50%]">
                                        {(entry.treatmentName as string) ?? t("gabinet.treatments.treatment")}
                                      </span>
                                      <span className="text-muted-foreground tabular-nums">
                                        {usedCount} / {totalCount}
                                        <span className="ml-1.5 text-[10px]">({statusLabel})</span>
                                      </span>
                                    </div>
                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className={`h-full transition-all rounded-full ${barColor}`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                        {!!pkg.expiresAt && (
                          <p className="text-xs text-muted-foreground">
                            {t("gabinet.packages.expires")}:{" "}
                            {new Date(pkg.expiresAt as number).toLocaleDateString(
                              i18n.language,
                            )}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Loyalty Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2.5">
                <Star className="h-4 w-4" variant="stroke" />
                {t("gabinet.loyalty.loyaltyProgram")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {t("gabinet.loyalty.pointsBalance")}
                  </p>
                  <p className="text-3xl font-bold text-primary">
                    {loyaltyBalance}
                  </p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {t("gabinet.loyalty.currentTier")}
                  </p>
                  <Badge variant="outline" className="text-lg mt-2">
                    {loyaltyTier
                      ? t(`gabinet.loyalty.tiers.${loyaltyTier}`)
                      : t("gabinet.loyalty.tiers.bronze")}
                  </Badge>
                </div>
              </div>
              {loyaltyTransactions && loyaltyTransactions.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">
                    {t("gabinet.loyalty.recentTransactions")}
                  </h4>
                  <div className="space-y-2">
                    {loyaltyTransactions.slice(0, 5).map((tx: Record<string, unknown>) => (
                      <div
                        key={tx._id as string}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div>
                          <p className="text-sm">
                            {t(`gabinet.loyalty.txTypes.${tx.type}`)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.createdAt as number).toLocaleDateString(
                              "pl-PL",
                            )}
                          </p>
                        </div>
                        <span
                          className={
                            (tx.points as number) > 0
                              ? "text-green-600 font-medium"
                              : "text-destructive font-medium"
                          }
                        >
                          {(tx.points as number) > 0 ? "+" : ""}
                          {tx.points as number}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2.5">
                <CreditCard className="h-4 w-4" variant="stroke" />
                {t("gabinet.payments.paymentHistory")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allPatientPayments && allPatientPayments.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        {t("gabinet.payments.totalSpent")}
                      </p>
                      <p className="text-2xl font-bold text-green-600">
                        {allPatientPayments
                          .filter((p: Record<string, unknown>) => p.status === "completed")
                          .reduce(
                            (sum: number, p: Record<string, unknown>) => sum + (p.amount as number),
                            0,
                          )
                          .toFixed(2)}{" "}
                        PLN
                      </p>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        {t("gabinet.payments.lastPayment")}
                      </p>
                      <p className="text-sm font-medium">
                        {allPatientPayments[0]
                          ? new Date(
                              (allPatientPayments[0] as Record<string, unknown>).createdAt as number,
                            ).toLocaleDateString(i18n.language)
                          : "-"}
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3 text-sm font-medium">
                            {t("gabinet.payments.amount")}
                          </th>
                          <th className="text-left p-3 text-sm font-medium">
                            {t("gabinet.payments.method")}
                          </th>
                          <th className="text-left p-3 text-sm font-medium">
                            {t("common.date")}
                          </th>
                          <th className="text-left p-3 text-sm font-medium">
                            {t("common.status")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {allPatientPayments
                          .slice(0, 10)
                          .map((payment: Record<string, unknown>) => (
                            <tr
                              key={payment._id as string}
                              className="border-b last:border-0 hover:bg-muted/30"
                            >
                              <td className="p-3 font-medium">
                                {(payment.amount as number).toFixed(2)}{" "}
                                {(payment.currency as string) ?? "PLN"}
                              </td>
                              <td className="p-3">
                                <Badge variant="outline">
                                  {t(
                                    `gabinet.payments.methods.${payment.paymentMethod}`,
                                  )}
                                </Badge>
                              </td>
                              <td className="p-3 text-sm text-muted-foreground">
                                {new Date(
                                  payment.createdAt as number,
                                ).toLocaleDateString(i18n.language)}
                              </td>
                              <td className="p-3">
                                <Badge
                                  variant={
                                    payment.status === "completed"
                                      ? "default"
                                      : "secondary"
                                  }
                                >
                                  {t(
                                    `gabinet.payments.status.${payment.status}`,
                                  )}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={CreditCard}
                  title={t("gabinet.payments.noPayments")}
                  description={t("gabinet.payments.noPaymentsDesc")}
                />
              )}
            </CardContent>
          </Card>
        </div>
      ),
    },
    {
      label: t("common.notes"),
      count: notes.length,
      content: (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2.5">
              <StickyNote className="h-4 w-4" variant="stroke" />
              {t("common.notes")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add note textarea */}
            <div className="space-y-2">
              {replyToNoteId && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{t("gabinet.notes.replyingTo")}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReplyToNoteId(null)}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              )}
              <Textarea
                placeholder={t("gabinet.notes.placeholder")}
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                rows={3}
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleCreateNote}
                  disabled={isNoteSubmitting || !newNoteContent.trim()}
                >
                  {isNoteSubmitting
                    ? t("common.saving")
                    : t("gabinet.notes.addNote")}
                </Button>
              </div>
            </div>

            <Separator />

            {/* Notes list */}
            {notes.length === 0 ? (
              <EmptyState
                icon={StickyNote}
                title={t("gabinet.notes.noNotes")}
                description={t("gabinet.notes.noNotesDesc")}
              />
            ) : (
              <div className="space-y-4">
                {rootNotes.map((note: Record<string, unknown>) => (
                  <div key={note._id as string}>
                    <NoteItem
                      note={note}
                      isEditing={editingNoteId === note._id}
                      editContent={editNoteContent}
                      onEditContentChange={setEditNoteContent}
                      onStartEdit={() => startEditNote(note)}
                      onCancelEdit={() => {
                        setEditingNoteId(null);
                        setEditNoteContent("");
                      }}
                      onSaveEdit={() => handleUpdateNote(note._id as Id<"notes">)}
                      onDelete={() => handleDeleteNote(note._id as Id<"notes">)}
                      onTogglePin={() => handleTogglePin(note._id as Id<"notes">)}
                      onReply={() => setReplyToNoteId(note._id as string)}
                      isSubmitting={isNoteSubmitting}
                    />
                    {/* Replies */}
                    {getReplies(note._id as string).length > 0 && (
                      <div className="ml-8 mt-2 space-y-2">
                        {getReplies(note._id as string).map((reply: Record<string, unknown>) => (
                          <NoteItem
                            key={reply._id as string}
                            note={reply}
                            isEditing={editingNoteId === reply._id}
                            editContent={editNoteContent}
                            onEditContentChange={setEditNoteContent}
                            onStartEdit={() => startEditNote(reply)}
                            onCancelEdit={() => {
                              setEditingNoteId(null);
                              setEditNoteContent("");
                            }}
                            onSaveEdit={() =>
                              handleUpdateNote(reply._id as Id<"notes">)
                            }
                            onDelete={() => handleDeleteNote(reply._id as Id<"notes">)}
                            onTogglePin={() =>
                              handleTogglePin(reply._id as Id<"notes">)
                            }
                            onReply={() => setReplyToNoteId(note._id as string)}
                            isSubmitting={isNoteSubmitting}
                            isReply
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      label: t("gabinet.appointments.tabs.documents", "Dokumenty"),
      content: (
        <AppointmentDocumentChecklist
          appointmentId={appointmentId}
          organizationId={organizationId}
          treatmentId={appointment.treatmentId}
        />
      ),
    },
    {
      label: t("gabinet.appointments.tabs.bodyChart"),
      content: (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>
                  {t("gabinet.appointments.tabs.bodyChart")}
                </CardTitle>
                <CardDescription>
                  {t("gabinet.bodyChart.description")}
                </CardDescription>
              </div>
              <Button onClick={() => setBodyChartModalOpen(true)}>
                {t("gabinet.bodyChart.openFullMap", "Otwórz mapę ciała")}
              </Button>
            </CardHeader>
            <CardContent>
              {bodyChartData.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {t("gabinet.bodyChart.markedCount", {
                      count: bodyChartData.length,
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {bodyChartData.map((region) => (
                      <div
                        key={region.region}
                        className="flex items-center gap-1.5 px-2 py-1 border rounded-md bg-card text-sm"
                      >
                        <div
                          className="w-3 h-3 rounded-sm"
                          style={{
                            backgroundColor: region.color,
                            opacity: region.intensity,
                          }}
                        />
                        <span>
                          {t(
                            `gabinet.bodyChart.regions.${region.region}`,
                            region.region,
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  {t(
                    "gabinet.bodyChart.noRegions",
                    "Brak zaznaczonych regionów. Otwórz mapę ciała aby zaznaczyć.",
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Body Chart Modal */}
          <Dialog
            open={bodyChartModalOpen}
            onOpenChange={setBodyChartModalOpen}
          >
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {t("gabinet.appointments.tabs.bodyChart")}
                </DialogTitle>
                <DialogDescription>
                  {t("gabinet.bodyChart.description")}
                </DialogDescription>
              </DialogHeader>
              <BodyChart
                data={bodyChartData}
                onChange={handleBodyChartChange}
              />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setBodyChartModalOpen(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={async () => {
                    await handleBodyChartSave();
                    setBodyChartModalOpen(false);
                  }}
                  disabled={isBodyChartSaving}
                >
                  {isBodyChartSaving
                    ? t("common.saving")
                    : t("common.save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ),
    },
  ];

  return (
    <>
      <EntityDetailLayout
        variant="sidebar-slot"
        isLoading={false}
        notFound={false}
        onBack={() => navigate({ to: "/dashboard/gabinet/calendar" })}
        title={headerTitle}
        headerSubtitle={headerSubtitle}
        avatarFallback={getPatientInitials()}
        actionsMenu={statusAction}
        fields={[]}
        tabs={tabs}
        defaultTab={t("gabinet.appointments.tabs.details")}
        breadcrumbs={breadcrumbsContent}
      />

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("gabinet.appointments.cancelTitle")}</DialogTitle>
            <DialogDescription>
              {t("gabinet.appointments.cancelDesc")}
            </DialogDescription>
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
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelConfirm}
              disabled={isUpdating}
            >
              {isUpdating
                ? t("common.processing")
                : t("gabinet.appointments.actions.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Gate Dialog */}
      <DocumentGateDialog
        open={gateDialogOpen}
        onOpenChange={setGateDialogOpen}
        appointmentId={appointmentId}
        organizationId={organizationId}
        timing={gateTiming}
        targetStatus={gateTargetStatus}
        onProceed={() => performStatusChange(gateTargetStatus)}
        onFillDocument={(docId) => {
          // Navigate to the documents tab — the user can click the document there
          // For now, we just close the dialog so they can use the documents tab
          setGateDialogOpen(false);
        }}
      />

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("gabinet.payments.addPayment")}</DialogTitle>
            <DialogDescription>
              {t("gabinet.payments.addPaymentDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{t("gabinet.payments.amount")}</Label>
              <Input
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder={outstanding > 0 ? outstanding.toFixed(2) : "0.00"}
              />
              {outstanding > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t("gabinet.payments.outstanding")}: {outstanding.toFixed(2)}{" "}
                  PLN
                </p>
              )}
            </div>
            <div>
              <Label>{t("gabinet.payments.method")}</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">
                    {t("gabinet.payments.methods.cash")}
                  </SelectItem>
                  <SelectItem value="card">
                    {t("gabinet.payments.methods.card")}
                  </SelectItem>
                  <SelectItem value="transfer">
                    {t("gabinet.payments.methods.transfer")}
                  </SelectItem>
                  <SelectItem value="other">
                    {t("gabinet.payments.methods.other")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("common.notes")}</Label>
              <Textarea
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder={t("gabinet.payments.notePlaceholder")}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPaymentDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCreatePayment}
              disabled={isPaymentSubmitting}
            >
              {isPaymentSubmitting
                ? t("common.processing")
                : t("gabinet.payments.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Multi-treatment package usage dialog */}
      <Dialog open={usageDialogOpen} onOpenChange={setUsageDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("gabinet.packages.useMultiple")}</DialogTitle>
            <DialogDescription>
              {t("gabinet.packages.useMultipleDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {usageDialogItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("gabinet.packages.allTreatmentsExhausted")}
              </p>
            ) : (
              usageDialogItems.map((item, idx) => (
                <div key={item.treatmentId} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.treatmentName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("gabinet.packages.availableRemaining", { remaining: item.remaining })}
                    </p>
                  </div>
                  <Input
                    type="number"
                    className="w-20"
                    min={0}
                    max={item.remaining}
                    value={item.qty}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(item.remaining, parseInt(e.target.value) || 0));
                      setUsageDialogItems((prev) =>
                        prev.map((it, i) => (i === idx ? { ...it, qty: val } : it)),
                      );
                    }}
                  />
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUsageDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={
                isUsageSubmitting ||
                usageDialogItems.every((it) => it.qty === 0)
              }
              onClick={async () => {
                if (!usageDialogPkgId) return;
                const items = usageDialogItems
                  .filter((it) => it.qty > 0)
                  .map((it) => ({
                    treatmentId: it.treatmentId as Id<"gabinetTreatments">,
                    quantity: it.qty,
                  }));
                if (items.length === 0) return;
                setIsUsageSubmitting(true);
                try {
                  await usePackageTreatmentsBatch({
                    organizationId,
                    usageId: usageDialogPkgId as Id<"gabinetPackageUsage">,
                    items,
                    appointmentId: appointmentId as Id<"gabinetAppointments">,
                  });
                  toast.success(t("gabinet.packages.usageRecorded"));
                  setUsageDialogOpen(false);
                  refetch();
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : String(e);
                  toast.error(msg);
                } finally {
                  setIsUsageSubmitting(false);
                }
              }}
            >
              {isUsageSubmitting ? t("common.saving") : t("gabinet.packages.recordUsage")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
