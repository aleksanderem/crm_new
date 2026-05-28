import { useState, useEffect } from "react";
import { createLazyFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatPhoneNumber } from "@/lib/phone";
import { useSupabaseActivitiesByEntity } from "@/hooks/use-supabase-activities";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChangeEmployeeModal } from "@/components/gabinet/change-employee-modal";
import { DocumentationTab } from "@/components/gabinet/documentation-tab";
import { RichTextEditor, plateJsonToText } from "@/components/gabinet/rich-text-editor";
import { Avatar as UntitledAvatar } from "@untitled/base/avatar/avatar";
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
import {
  EntityDetailLayout,
  type DetailField,
} from "@/components/crm/entity-detail-layout";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";
import { ActivityFeed } from "@/components/crm/activity-feed";
import { activitiesToFeedEntries } from "@/components/crm/activity-feed-adapter";
import { mergeTimelineSources } from "@/components/activity-timeline/merge-timeline-sources";
import type { SmsEventEntry, AutomationRunEntry, TimelineSourceEntry } from "@/components/activity-timeline/merge-timeline-sources";
import { AppointmentDocumentChecklist, useAppointmentDocumentCounts } from "@/components/documents/appointment-document-checklist";
import { DocumentGateDialog } from "@/components/documents/document-gate-dialog";
import { AfterCompletionDocumentsDialog } from "@/components/documents/after-completion-documents-dialog";
import { BodyChart, type BodyRegion } from "@/components/gabinet/BodyChart";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Calendar,
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
  MoreVerticalCircle02,
  MessageSquare,
  Send,
  Inbox,
} from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import type { AppointmentFullDetailNote } from "@cvx/gabinet/appointments";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { appointmentStatusBadgeClass } from "@/lib/gabinet-appointment-status";

export const Route = createLazyFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/appointments/$appointmentId",
)({
  component: AppointmentDetail,
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending_confirmation: ["scheduled", "confirmed", "cancelled"],
  scheduled: ["confirmed", "in_progress", "completed", "cancelled", "no_show"],
  confirmed: ["in_progress", "completed", "cancelled", "no_show"],
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
  hasReplies = false,
  isReply = false,
}: {
  note: AppointmentFullDetailNote;
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
  hasReplies?: boolean;
  isReply?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const authorName = note.authorName ?? t("common.unknown");
  const initials = authorName.slice(0, 2).toUpperCase();
  const dateStr = new Date(note.createdAt).toLocaleString(i18n.language);

  return (
    <article className="relative flex gap-3">
      {!!note.isPinned && (
        <Badge variant="outline" className="absolute top-0 right-0 text-xs">
          {t("gabinet.notes.pinned")}
        </Badge>
      )}
      <div className="flex shrink-0 flex-col">
        <UntitledAvatar
          size={isReply ? "sm" : "md"}
          initials={initials}
          alt={authorName}
        />
        {hasReplies && (
          <div className="relative my-1 flex h-full w-full justify-center self-center overflow-hidden">
            <svg className="absolute" width="2.4">
              <line
                x1="1.2" y1="1.2" x2="1.2" y2="100%"
                className="stroke-muted-foreground/30"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeDasharray="0,6"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <header>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {authorName}
            </span>
            <time className="text-xs text-muted-foreground">{dateStr}</time>
          </div>
        </header>

        {isEditing ? (
          <div className="space-y-2">
            <RichTextEditor
              value={editContent}
              onChange={(val) => onEditContentChange(val ?? "")}
              minHeight="80px"
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
          <div className="flex items-start gap-1">
            <section className="flex-1 rounded-lg rounded-tl-none border p-3">
              <p className="text-sm whitespace-pre-wrap">
                {plateJsonToText(note.content)}
              </p>
            </section>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                  <MoreVerticalCircle02 size={16} variant="stroke" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onReply}>
                  <MessageSquare className="h-4 w-4 mr-2" variant="stroke" />
                  {t("gabinet.notes.reply")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onStartEdit}>
                  <Pencil className="h-4 w-4 mr-2" variant="stroke" />
                  {t("common.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onTogglePin}>
                  <Star className="h-4 w-4 mr-2" variant="stroke" />
                  {note.isPinned
                    ? t("gabinet.notes.unpin")
                    : t("gabinet.notes.pin")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" variant="stroke" />
                  {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </article>
  );
}

function AppointmentDetail() {
  const { appointmentId } = Route.useParams();
  const { tab: tabSearch } = useSearch({
    from: "/_app/_auth/dashboard/_layout/gabinet/appointments/$appointmentId",
  });
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [internalNotes, setInternalNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>([]);
  const [isSavingTags, setIsSavingTags] = useState(false);

  const { tags: tagDefinitions } = useTagDefinitions(organizationId);


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

  // Change employee modal state
  const [changeEmployeeOpen, setChangeEmployeeOpen] = useState(false);

  // Document gate state
  const [gateDialogOpen, setGateDialogOpen] = useState(false);
  const [gateTiming, setGateTiming] = useState<"before_start" | "after_completion">("before_start");
  const [gateTargetStatus, setGateTargetStatus] = useState<string>("");

  // After-completion documents dialog (shown after appointment is completed)
  const [afterCompletionDialogOpen, setAfterCompletionDialogOpen] = useState(false);

  // Document counts for gate checks and status badges (must be before early returns)
  const docCounts = useAppointmentDocumentCounts(appointmentId, organizationId);

  const updateStatus = useAction(api.gabinet.appointments.updateStatus);
  const updateAppointment = useAction(api.gabinet.appointments.update);
  const trackView = useAction(api.recentlyViewed.track);
  const queryClient = useQueryClient();

  // Refresh the Supabase-backed appointment lists (calendar, dashboards, etc.)
  // after a Convex action mutates the appointment — Convex actions do not
  // automatically invalidate the React Query cache for Supabase reads.
  const invalidateAppointmentCaches = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetAppointments.all }),
      queryClient.invalidateQueries({ queryKey: supabaseKeys.scheduledActivities.all }),
      queryClient.invalidateQueries({ queryKey: supabaseKeys.activities.all }),
    ]);
  };

  // Payment actions (Supabase-primary)
  const createPayment = useAction(api.payments.create);
  const markPaymentPaid = useAction(api.payments.markPaid);
  const refundPayment = useAction(api.payments.refund);

  // Note actions (Supabase-primary)
  const createNote = useAction(api.notes.create);
  const updateNote = useAction(api.notes.update);
  const deleteNote = useAction(api.notes.remove);
  const togglePinNote = useAction(api.notes.togglePin);

  // Package usage mutation
  const usePackageTreatmentsBatch = useAction(api.gabinet.packages.usePackageTreatmentsBatch);

  // Note state
  const [newNoteContent, setNewNoteContent] = useState("");
  const [replyToNoteId, setReplyToNoteId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState("");
  const [isNoteSubmitting, setIsNoteSubmitting] = useState(false);

  const getFullDetailAction = useAction(api.gabinet.appointments.getFullDetail);
  const {
    data: detail,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["gabinet.appointment.fullDetail", organizationId, appointmentId],
    queryFn: () =>
      getFullDetailAction({
        organizationId,
        appointmentId: appointmentId as string,
      }),
    enabled: !!organizationId && !!appointmentId,
  });

  const { data: smsEvents = [] } = useQuery(
    convexQuery(api.gabinet.appointmentSms.listByAppointment, {
      organizationId,
      appointmentId: appointmentId as Id<"gabinetAppointments">,
    }),
  );

  const { data: activities } = useSupabaseActivitiesByEntity(
    organizationId,
    "gabinetAppointment",
    appointmentId,
  );

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

  // Initialize tagIds from appointment data
  useEffect(() => {
    setTagIds((detail?.appointment.tagIds as Id<"tagDefinitions">[] | undefined) ?? []);
  }, [detail?.appointment._id, detail?.appointment.tagIds]);

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

  // Collapse app sidebar to icon-only so EntityDetailLayout sidebar has room
  const { setShellSidebarMode } = useSidebarSlot();
  useEffect(() => {
    setShellSidebarMode("icon-only");
    return () => setShellSidebarMode("default");
  }, [setShellSidebarMode]);

  const handleTagsChange = async (newTagIds: Id<"tagDefinitions">[]) => {
    setTagIds(newTagIds);
    if (!detail) return;
    setIsSavingTags(true);
    try {
      await updateAppointment({
        organizationId,
        appointmentId: detail.appointment._id,
        tagIds: newTagIds,
      });
      await invalidateAppointmentCaches();
      refetch();
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
      setTagIds((detail.appointment.tagIds as Id<"tagDefinitions">[] | undefined) ?? []);
    } finally {
      setIsSavingTags(false);
    }
  };

  // Build fields for EntityDetailLayout sidebar
  const detailFields: DetailField[] = (() => {
    if (!detail) return [];
    const { appointment: appt, treatment: treat } = detail;
    const fields: DetailField[] = [
      { label: t("gabinet.treatments.treatment"), value: treat?.name ?? "-", fieldKey: "treatment" },
      { label: t("common.date"), value: new Date(appt.date).toLocaleDateString(i18n.language), fieldKey: "date" },
      { label: t("common.time"), value: `${appt.startTime?.substring(0, 5) ?? ""} - ${appt.endTime?.substring(0, 5) ?? ""}`, fieldKey: "time" },
    ];
    if (treat?.price !== undefined) {
      fields.push({ label: t("common.price"), value: `${treat.price.toFixed(2)} ${treat.currency ?? "PLN"}`, fieldKey: "price" });
    }
    if ((appt.status === "completed" || appt.status === "cancelled") && appt.updatedAt) {
      fields.push({
        label: appt.status === "completed" ? t("gabinet.appointments.completedAt", "Zakończono") : t("gabinet.appointments.cancelledAt", "Anulowano"),
        value: new Date(appt.updatedAt).toLocaleString(i18n.language),
        fieldKey: "statusDate",
      });
    }
    return fields;
  })();

  // Sidebar extra: patient card, employee card, packages
  const sidebarExtra = (() => {
    if (!detail) return null;
    const { appointment: appt, patient: pat, treatment: treat, employee: emp, patientPackageUsage: pkgUsage, loyaltyBalance: loyBal } = detail;
    const empName = emp ? (emp.name ?? emp.email ?? "-") : "-";
    const relevantPkgs = (pkgUsage ?? []).filter((pkg) =>
      pkg.treatmentsUsed.some((tu) => tu.treatmentId === appt.treatmentId),
    );

    return (
      <div className="space-y-3">
        {/* Patient card */}
        <Item variant="outline" size="sm" className="relative">
          <ItemMedia>
            <Avatar className="h-9 w-9 bg-purple-100 dark:bg-purple-900/50">
              <AvatarFallback className="text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                {pat?.firstName && pat?.lastName ? `${pat.firstName[0]}${pat.lastName[0]}` : "?"}
              </AvatarFallback>
            </Avatar>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{pat?.firstName} {pat?.lastName}</ItemTitle>
            <ItemDescription className="text-xs">
              {[pat?.phone ? formatPhoneNumber(pat.phone) : undefined, pat?.email].filter(Boolean).join(" · ")}
            </ItemDescription>
            {loyBal > 0 && (
              <Badge variant="outline" className="mt-0.5 w-fit text-[10px]">
                <Star size={10} variant="stroke" className="mr-1" />
                {loyBal} {t("gabinet.loyalty.points")}
              </Badge>
            )}
          </ItemContent>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="absolute right-1 top-1 size-7">
                <MoreVerticalCircle02 size={16} variant="stroke" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link to="/dashboard/gabinet/patients/$patientId" params={{ patientId: pat?._id ?? "" }}>
                  <Eye size={14} variant="stroke" className="mr-2" />
                  {t("gabinet.patients.viewProfile", "Profil klienta")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/dashboard/gabinet/patients/$patientId" params={{ patientId: pat?._id ?? "" }} search={{ tab: "history" }}>
                  <History size={14} variant="stroke" className="mr-2" />
                  {t("gabinet.patients.history", "Historia wizyt")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {pat?.phone && (
                <DropdownMenuItem asChild>
                  <a href={`tel:${pat.phone}`}><Phone size={14} variant="stroke" className="mr-2" />{t("common.call", "Zadzwoń")}</a>
                </DropdownMenuItem>
              )}
              {pat?.email && (
                <DropdownMenuItem asChild>
                  <a href={`mailto:${pat.email}`}><Mail size={14} variant="stroke" className="mr-2" />{t("common.sendEmail", "Wyślij e-mail")}</a>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </Item>

        {/* Employee card */}
        {emp && (
          <Item variant="outline" size="sm" className="relative">
            <ItemMedia>
              <Avatar className="h-9 w-9 bg-cyan-100 dark:bg-cyan-900/50">
                {emp.image && <AvatarImage src={emp.image} alt={empName} />}
                <AvatarFallback className="text-xs font-medium bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300">
                  {empName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{empName}</ItemTitle>
              <ItemDescription className="text-xs">{emp.email ?? t("gabinet.employees.employee")}</ItemDescription>
            </ItemContent>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="absolute right-1 top-1 size-7">
                  <MoreVerticalCircle02 size={16} variant="stroke" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {emp.email && (
                  <DropdownMenuItem asChild>
                    <a href={`mailto:${emp.email}`}><Mail size={14} variant="stroke" className="mr-2" />{t("common.sendEmail", "Wyślij e-mail")}</a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setChangeEmployeeOpen(true)}>
                  <RefreshCcw size={14} variant="stroke" className="mr-2" />
                  {t("gabinet.appointments.changeEmployee", "Zmień pracownika")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Item>
        )}

        {/* Packages */}
        {relevantPkgs.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {t("gabinet.packages.activePackages", "Aktywne pakiety")}
            </p>
            {relevantPkgs.map((pkg) => {
              const relevantTreatment = pkg.treatmentsUsed.find(
                (tu) => tu.treatmentId === appt.treatmentId,
              );
              const used = relevantTreatment?.usedCount ?? 0;
              const total = relevantTreatment?.totalCount ?? 0;
              const remaining = Math.max(total - used, 0);
              const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
              let barColor = "bg-emerald-500";
              if (remaining <= 0) barColor = "bg-red-500";
              else if (remaining / total < 0.3) barColor = "bg-amber-500";
              return (
                <div key={pkg._id} className="rounded-md border p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium truncate">{pkg.packageName}</p>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${pkg.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400" : ""}`}>
                      {t(`gabinet.packages.status.${pkg.status}`)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground truncate">{treat?.name}</span>
                    <span className="tabular-nums text-muted-foreground shrink-0">{used} / {total}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tags */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {t("common.tags")}
            </p>
            {isSavingTags && (
              <span className="text-[10px] text-muted-foreground">
                {t("common.saving")}
              </span>
            )}
          </div>
          <TagsPicker
            tags={tagDefinitions}
            selectedIds={tagIds}
            onChange={handleTagsChange}
          />
        </div>
      </div>
    );
  })();

  if (!detail && !isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-3">
          <h2 className="text-lg font-semibold">{t("common.notFound")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("common.notFoundDescription")}
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/dashboard/gabinet/calendar" })}>
            &larr; {t("common.goBack")}
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || !detail) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse space-y-4 w-full max-w-md px-4">
          <div className="h-5 w-40 rounded bg-muted" />
          <div className="h-4 w-28 rounded bg-muted" />
          <div className="h-9 w-full rounded bg-muted" />
        </div>
      </div>
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

  const performStatusChange = async (newStatus: string) => {
    setIsUpdating(true);
    try {
      await updateStatus({
        organizationId,
        appointmentId: appointment._id,
        status: newStatus as "scheduled" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show" | "pending_confirmation",
      });
      toast.success(t("gabinet.appointments.statusUpdated"));
      await invalidateAppointmentCaches();
      refetch();

      // When completing: the backend auto-generates after_completion docs.
      // Open dialog so the employee can fill them before they're sent to client.
      if (newStatus === "completed") {
        // Small delay so Convex reactive query picks up the new documents
        setTimeout(() => setAfterCompletionDialogOpen(true), 500);
      }
    } catch (error) {
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

    // Document gate: check before transitioning to in_progress
    if (newStatus === "in_progress" && docCounts.missingBefore > 0) {
      setGateTiming("before_start");
      setGateTargetStatus(newStatus);
      setGateDialogOpen(true);
      return;
    }
    // Note: no gate for "completed" — after_completion docs are generated
    // on completion, then the employee fills them post-completion.

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
      await invalidateAppointmentCaches();
      refetch();
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    } finally {
      setIsPaymentSubmitting(false);
    }
  };

  const handleMarkPaid = async (paymentId: string) => {
    try {
      await markPaymentPaid({
        organizationId,
        paymentId: paymentId as Id<"payments">,
      });
      toast.success(t("gabinet.payments.markedPaid"));
      refetch();
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    }
  };

  const handleRefundPayment = async (paymentId: string) => {
    try {
      await refundPayment({
        organizationId,
        paymentId: paymentId as Id<"payments">,
      });
      toast.success(t("gabinet.payments.refunded"));
      refetch();
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    }
  };

  const handleTogglePin = async (noteId: Id<"notes">) => {
    try {
      await togglePinNote({ organizationId, noteId });
      refetch();
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    }
  };

  const startEditNote = (note: AppointmentFullDetailNote) => {
    setEditingNoteId(note._id);
    setEditNoteContent(note.content);
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    } finally {
      setIsBodyChartSaving(false);
    }
  };

  // Group notes by parent for threading
  const rootNotes = notes.filter((n) => !n.parentNoteId);
  const getReplies = (noteId: string) =>
    notes.filter((n) => n.parentNoteId === noteId);

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
    activities: (activities ?? []).map((a: any) => ({
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
    // No badge for "completed" — after_completion docs are generated post-completion
    return 0;
  };

  // Status dot color map
  const statusDotColors: Record<string, string> = {
    pending_confirmation: "bg-yellow-500",
    scheduled: "bg-blue-500",
    confirmed: "bg-green-500",
    in_progress: "bg-primary",
    completed: "bg-green-600",
    cancelled: "bg-destructive",
    no_show: "bg-destructive",
  };

  // Status dropdown as actions menu
  const statusAction = availableTransitions.length > 0 ? (
    <Select
      value={appointment.status}
      onValueChange={(value) => handleStatusChange(value)}
      disabled={isUpdating}
    >
      <SelectTrigger className="h-9 w-auto gap-2 text-sm font-medium">
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotColors[appointment.status] ?? "bg-muted-foreground"}`} />
          {t(`gabinet.appointments.statuses.${appointment.status}`)}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={appointment.status} disabled>
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotColors[appointment.status] ?? "bg-muted-foreground"}`} />
            {t(`gabinet.appointments.statuses.${appointment.status}`)}
          </span>
        </SelectItem>
        {availableTransitions.map((status) => {
          const docBadge = getDocBadgeCount(status);
          return (
            <SelectItem key={status} value={status}>
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotColors[status] ?? "bg-muted-foreground"}`} />
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
    <span className="flex items-center gap-2 text-sm font-medium">
      <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotColors[appointment.status] ?? "bg-muted-foreground"}`} />
      {t(`gabinet.appointments.statuses.${appointment.status}`)}
    </span>
  );


  // Build tabs array
  const tabs = [
    {
      label: t("gabinet.appointments.tabs.details"),
      content: (
        <div className="space-y-4">
          {/* Treatment Info Card */}
          <Card>
            <CardHeader className="px-6 py-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4" variant="stroke" />
                {t("gabinet.treatments.treatment")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-6 py-4">
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
                  <p className="text-sm mt-1">{plateJsonToText(treatment.description)}</p>
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
                  <p className="text-sm">{plateJsonToText(treatment.contraindications)}</p>
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
                  <p className="text-sm">{plateJsonToText((treatment as Record<string, unknown>).aftercare as string)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Employee Info Card */}
          <Card>
            <CardHeader className="px-6 py-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserCircle className="h-4 w-4" variant="stroke" />
                {t("gabinet.employees.employee")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 py-4">
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
            <CardHeader className="px-6 py-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" variant="stroke" />
                {t("gabinet.appointments.scheduling")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-6 py-4">
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
            <CardHeader className="px-6 py-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4" variant="stroke" />
                {t("gabinet.appointmentDetail.sms.title")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("gabinet.appointmentDetail.sms.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-6 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={smsSummary.tone}>
                  {t(smsSummary.labelKey)}
                </Badge>
                <Badge
                  variant="outline"
                  className={appointmentStatusBadgeClass(appointment.status)}
                >
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
              <CardHeader className="px-6 py-3 border-b">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4" variant="stroke" />
                  {t("gabinet.appointments.prepayment")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-6 py-4">
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
            <CardHeader className="px-6 py-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <StickyNote className="h-4 w-4" variant="stroke" />
                {t("gabinet.appointments.internalNotes")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("gabinet.appointments.internalNotesDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-6 py-4">
              <RichTextEditor
                placeholder={t(
                  "gabinet.appointments.internalNotesPlaceholder",
                )}
                value={internalNotes}
                onChange={(val) => setInternalNotes(val ?? "")}
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
            <CardHeader className="px-6 py-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4" variant="stroke" />
                {t("gabinet.payments.summary")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 py-4">
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
            <CardHeader className="flex flex-row items-center justify-between px-6 py-3 border-b">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <CreditCard className="h-4 w-4" variant="stroke" />
                  {t("gabinet.payments.payments")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("gabinet.payments.linkedToAppointment")}
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPaymentDialogOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" variant="stroke" />
                {t("gabinet.payments.addPayment")}
              </Button>
            </CardHeader>
            <CardContent className="px-6 py-4">
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
                        <th className="text-right p-3 text-sm font-medium">
                          {t("common.actions")}
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
                          <td className="p-3 text-right">
                            {payment.status === "pending" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleMarkPaid(payment._id as string)}
                              >
                                {t("gabinet.payments.markPaid")}
                              </Button>
                            )}
                            {payment.status === "completed" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => handleRefundPayment(payment._id as string)}
                              >
                                {t("gabinet.payments.refund")}
                              </Button>
                            )}
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
              <CardHeader className="px-6 py-3 border-b">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4" variant="stroke" />
                  {t("gabinet.packages.packageUsage")}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-6 py-4">
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
            <CardHeader className="px-6 py-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" variant="stroke" />
                {t("detail.tabs.timeline", "Timeline")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t(
                  "gabinet.appointmentDetail.history.unifiedDescription",
                  "Unified operational history for this appointment, including messages and workflow events.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 py-4">
              <ActivityFeed
                entries={activitiesToFeedEntries(mergedTimeline as any[])}
                maxHeight="400px"
              />
            </CardContent>
          </Card>

          {/* Past Appointments Timeline */}
          <Card>
            <CardHeader className="px-6 py-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <History className="h-4 w-4" variant="stroke" />
                {t("gabinet.patients.appointmentHistory")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("gabinet.patients.lastAppointments", { count: 20 })}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 py-4">
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
                    {patientHistory.map((appt, index) => (
                      <div key={appt._id} className="relative flex gap-4">
                        <div className="relative z-10 flex items-center justify-center w-6 h-6 rounded-full bg-background border-2">
                          {index === 0 && (
                            <div className="w-2 h-2 rounded-full bg-primary" />
                          )}
                        </div>
                        <Link
                          to="/dashboard/gabinet/appointments/$appointmentId"
                          params={{ appointmentId: appt._id }}
                          className="flex-1 flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div>
                            <p className="font-medium">
                              {appt.treatment?.name ?? "-"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatDate(appt.date)} &bull;{" "}
                              {formatTime(appt.startTime)} -{" "}
                              {formatTime(appt.endTime)}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={appointmentStatusBadgeClass(appt.status)}
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
            <CardHeader className="px-6 py-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4" variant="stroke" />
                {t("gabinet.packages.activePackages")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 py-4">
              {patientPackageUsage.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title={t("gabinet.packages.noActivePackages")}
                  description={t("gabinet.packages.noActivePackagesDesc")}
                />
              ) : (
                <div className="space-y-3">
                  {patientPackageUsage.map((pkg) => {
                    const totals = { used: pkg.totalUsed, total: pkg.totalCount };
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
                      <div key={pkg._id} className="p-4 border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">
                            {pkg.packageName ?? t("gabinet.packages.package")}
                          </p>
                          <div className="flex items-center gap-2">
                            {pkg.status === "active" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setUsageDialogPkgId(pkg._id);
                                  setUsageDialogItems(
                                    pkg.treatmentsUsed
                                      .filter((e) => (e.usedCount ?? 0) < (e.totalCount ?? 0))
                                      .map((e) => ({
                                        treatmentId: e.treatmentId,
                                        treatmentName: e.treatmentName ?? t("gabinet.packages.treatment"),
                                        remaining: (e.totalCount ?? 0) - (e.usedCount ?? 0),
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
                              variant="outline"
                              className={pkg.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400" : ""}
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
                        {pkg.treatmentsUsed.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                {t("gabinet.packages.perTreatmentProgress")}
                              </p>
                              {pkg.treatmentsUsed.map((entry, index) => {
                                const usedCount = entry.usedCount ?? 0;
                                const totalCount = entry.totalCount ?? 0;
                                const remaining = totalCount - usedCount;
                                const pct = totalCount > 0 ? Math.round((usedCount / totalCount) * 100) : 0;
                                const remainingRatio = totalCount > 0 ? remaining / totalCount : 1;
                                let barColor = "bg-emerald-500";
                                let statusLabel = t("gabinet.packages.plentyRemaining");
                                if (remainingRatio <= 0) { barColor = "bg-red-500"; statusLabel = t("gabinet.packages.fullyUsed"); }
                                else if (remainingRatio < 0.1) { barColor = "bg-red-500"; statusLabel = t("gabinet.packages.almostExhausted"); }
                                else if (remainingRatio < 0.3) { barColor = "bg-amber-500"; statusLabel = t("gabinet.packages.runningLow"); }

                                return (
                                  <div key={`${pkg._id}-${entry.treatmentId ?? index}`} className="space-y-1">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="truncate max-w-[50%]">
                                        {entry.treatmentName ?? t("gabinet.treatments.treatment")}
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
                            {new Date(pkg.expiresAt).toLocaleDateString(
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
            <CardHeader className="px-6 py-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <Star className="h-4 w-4" variant="stroke" />
                {t("gabinet.loyalty.loyaltyProgram")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 py-4">
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
            <CardHeader className="px-6 py-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <CreditCard className="h-4 w-4" variant="stroke" />
                {t("gabinet.payments.paymentHistory")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 py-4">
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
          <CardHeader className="px-6 py-3 border-b">
            <CardTitle className="text-sm flex items-center gap-2">
              <StickyNote className="h-4 w-4" variant="stroke" />
              {t("common.notes")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-6 py-4">
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
              <RichTextEditor
                placeholder={t("gabinet.notes.placeholder")}
                value={newNoteContent}
                onChange={(val) => setNewNoteContent(val ?? "")}
                minHeight="80px"
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
              <ul className="flex flex-col gap-8">
                {rootNotes.map((note) => {
                  const replies = getReplies(note._id);
                  return (
                    <li key={note._id}>
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
                        onSaveEdit={() => handleUpdateNote(note._id)}
                        onDelete={() => handleDeleteNote(note._id)}
                        onTogglePin={() => handleTogglePin(note._id)}
                        onReply={() => setReplyToNoteId(note._id)}
                        isSubmitting={isNoteSubmitting}
                        hasReplies={replies.length > 0}
                      />
                      {replies.length > 0 && (
                        <ul className="ml-12 mt-4 flex flex-col gap-6">
                          {replies.map((reply) => (
                            <li key={reply._id}>
                              <NoteItem
                                note={reply}
                                isEditing={editingNoteId === reply._id}
                                editContent={editNoteContent}
                                onEditContentChange={setEditNoteContent}
                                onStartEdit={() => startEditNote(reply)}
                                onCancelEdit={() => {
                                  setEditingNoteId(null);
                                  setEditNoteContent("");
                                }}
                                onSaveEdit={() => handleUpdateNote(reply._id)}
                                onDelete={() => handleDeleteNote(reply._id)}
                                onTogglePin={() => handleTogglePin(reply._id)}
                                onReply={() => setReplyToNoteId(note._id)}
                                isSubmitting={isNoteSubmitting}
                                isReply
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      label: t("gabinet.appointments.tabs.documentation", "Dokumentacja"),
      content: (
        <DocumentationTab
          organizationId={organizationId}
          appointmentId={appointment._id}
          appointment={appointment}
          treatmentParameters={treatment?.parameters as any}
          onChanged={async () => {
            await invalidateAppointmentCaches();
            await refetch();
          }}
        />
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
            <CardHeader className="flex flex-row items-center justify-between px-6 py-3 border-b">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Heart className="h-4 w-4" variant="stroke" />
                  {t("gabinet.appointments.tabs.bodyChart")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("gabinet.bodyChart.description")}
                </CardDescription>
              </div>
              <Button onClick={() => setBodyChartModalOpen(true)}>
                {t("gabinet.bodyChart.openFullMap", "Otwórz mapę ciała")}
              </Button>
            </CardHeader>
            <CardContent className="px-6 py-4">
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
            <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
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
        isLoading={isLoading}
        notFound={!detail && !isLoading}
        onBack={() => navigate({ to: "/dashboard/gabinet/calendar" })}
        title={headerTitle}
        subtitle={headerSubtitle}
        avatarFallback={patient ? `${patient.firstName?.[0] ?? ""}${patient.lastName?.[0] ?? ""}`.toUpperCase() : "?"}
        actionsMenu={statusAction}
        fields={detailFields}
        expandedFieldCount={5}
        sidebarExtra={sidebarExtra}
        tabs={tabs}
        defaultTab={
          tabSearch === "payments" ? t("gabinet.payments.payments") : undefined
        }
      />

      {/* Change Employee Modal */}
      {detail && (
        <ChangeEmployeeModal
          open={changeEmployeeOpen}
          onOpenChange={setChangeEmployeeOpen}
          organizationId={organizationId}
          appointmentId={appointmentId as Id<"gabinetAppointments">}
          treatmentId={detail.appointment.treatmentId as Id<"gabinetTreatments">}
          currentEmployeeId={detail.appointment.employeeId}
          appointmentDate={detail.appointment.date}
          startTime={detail.appointment.startTime}
          endTime={detail.appointment.endTime}
          durationMinutes={detail.treatment?.duration ?? 30}
        />
      )}

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("gabinet.appointments.cancelTitle")}</DialogTitle>
            <DialogDescription>
              {t("gabinet.appointments.cancelDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <RichTextEditor
              placeholder={t("gabinet.appointments.cancelReasonPlaceholder")}
              value={cancelReason}
              onChange={(val) => setCancelReason(val ?? "")}
              minHeight="80px"
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
        onFillDocument={(_docId) => {
          // Navigate to the documents tab — the user can click the document there
          // For now, we just close the dialog so they can use the documents tab
          setGateDialogOpen(false);
        }}
      />

      {/* After-Completion Documents Dialog */}
      <AfterCompletionDocumentsDialog
        open={afterCompletionDialogOpen}
        onOpenChange={setAfterCompletionDialogOpen}
        appointmentId={appointmentId}
        organizationId={organizationId}
      />

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md">
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
              <RichTextEditor
                value={paymentNote}
                onChange={(val) => setPaymentNote(val ?? "")}
                placeholder={t("gabinet.payments.notePlaceholder")}
                minHeight="80px"
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
                    treatmentId: it.treatmentId,
                    quantity: it.qty,
                  }));
                if (items.length === 0) return;
                setIsUsageSubmitting(true);
                try {
                  await usePackageTreatmentsBatch({
                    organizationId,
                    usageId: usageDialogPkgId,
                    items,
                    appointmentId,
                  });
                  toast.success(t("gabinet.packages.usageRecorded"));
                  setUsageDialogOpen(false);
                  refetch();
                } catch (e) {
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
