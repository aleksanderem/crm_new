import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  createLazyFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatCurrencyPLN } from "@/lib/format-currency";
import { useSupabaseActivitiesByEntity } from "@/hooks/use-supabase-activities";
import { useSupabaseGabinetEquipmentList } from "@/hooks/use-supabase-gabinet-equipment";
import { useSupabaseGabinetSameDayAppointments } from "@/hooks/use-supabase-gabinet-appointments";
import { useSupabaseAutomationEntityRuns } from "@/hooks/use-supabase-automation";
import { useSupabaseGabinetReceiptsByAppointment } from "@/hooks/use-supabase-gabinet-receipts";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  EntityDetailLayout,
  type DetailField,
} from "@/components/crm/entity-detail-layout";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";
import { mergeTimelineSources } from "@/components/activity-timeline/merge-timeline-sources";
import type {
  SmsEventEntry,
  AutomationRunEntry,
  TimelineSourceEntry,
} from "@/components/activity-timeline/merge-timeline-sources";
import {
  AppointmentDocumentChecklist,
  useAppointmentDocumentCounts,
} from "@/components/documents/appointment-document-checklist";
import { DocumentGateDialog } from "@/components/documents/document-gate-dialog";
import { AfterCompletionDocumentsDialog } from "@/components/documents/after-completion-documents-dialog";
import { Package, Send } from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { PermissionGate, usePermission } from "@/hooks/use-permission";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { appointmentStatusBadgeClass } from "@/lib/gabinet-appointment-status";
import { ChangeEmployeeModal } from "@/components/gabinet/change-employee-modal";
import { DocumentationTab } from "@/components/gabinet/documentation-tab";

import { AppointmentSidebarExtra } from "@/components/gabinet/appointments/appointment-sidebar-extra";
import { AppointmentDetailsTab } from "@/components/gabinet/appointments/appointment-details-tab";
import { AppointmentPaymentsTab } from "@/components/gabinet/appointments/appointment-payments-tab";
import { AppointmentHistoryTab } from "@/components/gabinet/appointments/appointment-history-tab";
import { AppointmentReceiptsTab } from "@/components/gabinet/appointments/appointment-receipts-tab";
import { CancelAppointmentDialog } from "@/components/gabinet/appointments/cancel-appointment-dialog";
import { PaymentAppointmentDialog } from "@/components/gabinet/appointments/payment-appointment-dialog";
import { PackageUsageDialog } from "@/components/gabinet/appointments/package-usage-dialog";

function AppointmentDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export const Route = createLazyFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/appointments/$appointmentId",
)({
  component: () => (
    <PermissionGate
      feature="gabinet_appointments"
      action="view"
      loadingFallback={<AppointmentDetailSkeleton />}
    >
      <AppointmentDetail />
    </PermissionGate>
  ),
});

// All statuses can transition to any other status. Lets staff correct mistakes
// after a visit was already marked completed/cancelled/no_show (issue #1027).
const ALL_STATUSES = [
  "pending_confirmation",
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;

const VALID_TRANSITIONS: Record<string, string[]> = Object.fromEntries(
  ALL_STATUSES.map((s) => [s, ALL_STATUSES.filter((t) => t !== s)]),
);

function getSmsSummary(
  events: Array<Record<string, unknown>>,
  appointmentStatus: string,
) {
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
        return {
          labelKey: "gabinet.appointmentDetail.sms.summaryConfirmed",
          tone: "default" as const,
        };
      }
      if (latestInbound.parsedIntent === "cancel") {
        return {
          labelKey: "gabinet.appointmentDetail.sms.summaryCancelled",
          tone: "destructive" as const,
        };
      }
    }

    if (latestInbound.processingStatus === "failed") {
      return {
        labelKey: "gabinet.appointmentDetail.sms.summaryFailed",
        tone: "destructive" as const,
      };
    }

    return {
      labelKey: "gabinet.appointmentDetail.sms.summaryIgnored",
      tone: "secondary" as const,
    };
  }

  if (latestOutbound) {
    if (latestOutbound.processingStatus === "failed") {
      return {
        labelKey: "gabinet.appointmentDetail.sms.summaryFailed",
        tone: "destructive" as const,
      };
    }
    if (latestOutbound.processingStatus === "pending") {
      return {
        labelKey: "gabinet.appointmentDetail.sms.summaryQueued",
        tone: "outline" as const,
      };
    }
    return {
      labelKey: "gabinet.appointmentDetail.sms.summarySent",
      tone: "secondary" as const,
    };
  }

  if (appointmentStatus === "pending_confirmation") {
    return {
      labelKey: "gabinet.appointmentDetail.sms.summaryAwaitingRequest",
      tone: "outline" as const,
    };
  }

  return {
    labelKey: "gabinet.appointmentDetail.sms.summaryNoHistory",
    tone: "secondary" as const,
  };
}

function AppointmentDetail() {
  const { appointmentId } = Route.useParams();
  const { tab: tabSearch } = useSearch({
    from: "/_app/_auth/dashboard/_layout/gabinet/appointments/$appointmentId",
  });
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { allowed: canEdit } = usePermission("gabinet_appointments", "edit");
  const { allowed: canDelete } = usePermission("gabinet_appointments", "delete");
  const { allowed: canCreatePayment } = usePermission("gabinet_payments", "create");
  const { allowed: canEditPayment } = usePermission("gabinet_payments", "edit");
  const { allowed: canRefundPayment } = usePermission("gabinet_payments", "refund");
  const { allowed: canGenerateReceipt } = usePermission("gabinet_receipts", "create");

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [internalNotes, setInternalNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>([]);
  const [isSavingTags, setIsSavingTags] = useState(false);

  const [editTreatmentId, setEditTreatmentId] = useState("");
  const [treatmentPickerOpen, setTreatmentPickerOpen] = useState(false);
  const [treatmentSearch, setTreatmentSearch] = useState("");
  const [isSavingTreatment, setIsSavingTreatment] = useState(false);

  const { tags: tagDefinitions } = useTagDefinitions(organizationId);

  // Payment management state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  // Package usage dialog state
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [usageDialogPkgId, setUsageDialogPkgId] = useState<string | null>(null);
  const [usageDialogItems, setUsageDialogItems] = useState<
    Array<{
      treatmentId: string;
      variantId?: string;
      treatmentName: string;
      remaining: number;
      qty: number;
    }>
  >([]);
  const [isUsageSubmitting, setIsUsageSubmitting] = useState(false);

  // Change employee modal state
  const [changeEmployeeOpen, setChangeEmployeeOpen] = useState(false);

  // Document gate state
  const [gateDialogOpen, setGateDialogOpen] = useState(false);
  const [gateTiming, setGateTiming] = useState<
    "before_start" | "during_visit" | "after_completion"
  >("before_start");
  const [gateTargetStatus, setGateTargetStatus] = useState<string>("");

  // After-completion documents dialog (shown after appointment is completed)
  const [afterCompletionDialogOpen, setAfterCompletionDialogOpen] =
    useState(false);

  // Document counts for gate checks and status badges (must be before early returns)
  const docCounts = useAppointmentDocumentCounts(appointmentId, organizationId);

  const updateStatus = useAction(api.gabinet.appointments.updateStatus);
  const updateAppointment = useAction(api.gabinet.appointments.update);
  const trackView = useAction(api.recentlyViewed.track);
  const sendReminderNow = useAction(api.gabinet.appointmentReminders.sendReminderNow);
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const queryClient = useQueryClient();

  // Refresh the Supabase-backed appointment lists (calendar, dashboards, etc.)
  // after a Convex action mutates the appointment — Convex actions do not
  // automatically invalidate the React Query cache for Supabase reads.
  // Payments are included so the calendar's per-tile paid/unpaid indicator
  // (issue #1040) reflects new receipts immediately.
  const invalidateAppointmentCaches = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: supabaseKeys.gabinetAppointments.all,
      }),
      queryClient.invalidateQueries({
        queryKey: supabaseKeys.scheduledActivities.all,
      }),
      queryClient.invalidateQueries({ queryKey: supabaseKeys.activities.all }),
      queryClient.invalidateQueries({ queryKey: supabaseKeys.payments.all }),
    ]);
  };

  // Payment actions (Supabase-primary)
  const markPaymentPaid = useAction(api.payments.markPaid);
  const refundPayment = useAction(api.payments.refund);
  const generatePdfReceipt = useAction(api.gabinet.receipts.generatePdfReceipt);
  const [generatingReceiptFor, setGeneratingReceiptFor] = useState<string | null>(null);

  // Package usage mutation
  const usePackageTreatmentsBatch = useAction(
    api.gabinet.packages.usePackageTreatmentsBatch,
  );

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

  // Treatments + locations for the inline edit controls on the Details tab
  const listActiveTreatments = useAction(api.gabinet.treatments.listActive);
  const { data: treatmentsList } = useQuery({
    queryKey: ["gabinet.treatments.listActive", organizationId],
    queryFn: () => listActiveTreatments({ organizationId }),
    enabled: !!organizationId,
  }) as {
    data:
      | Array<{
          _id: string;
          name: string;
          duration: number;
          price?: number;
          currency?: string;
        }>
      | undefined;
  };

  const listSmsEventsAction = useAction(
    api.gabinet.appointmentSms.listByAppointment,
  );
  const { data: smsEvents = [] } = useQuery({
    queryKey: [
      "gabinet.appointmentSms.listByAppointment",
      organizationId,
      appointmentId,
    ],
    queryFn: () =>
      listSmsEventsAction({
        organizationId,
        appointmentId: appointmentId as Id<"gabinetAppointments">,
      }),
    enabled: !!organizationId && !!appointmentId,
  }) as {
    data:
      | Array<{
          _id: string;
          direction: "inbound" | "outbound";
          eventType: string;
          rawBody?: string;
          processingStatus?: string;
          parsedIntent?: string;
          createdAt: number;
        }>
      | undefined;
  };

  const { data: activities } = useSupabaseActivitiesByEntity(
    organizationId,
    "gabinetAppointment",
    appointmentId,
  );

  const { data: automationRuns = [] } = useSupabaseAutomationEntityRuns(
    organizationId,
    "gabinetAppointment",
    appointmentId,
  );

  // Same-day appointments for the same patient — used to warn staff that more
  // Other same-day appointments for the same patient — shown in the settlement
  // dialog so staff can batch-settle multiple visits at once (issue #3578).
  const { data: sameDayOtherAppointments } =
    useSupabaseGabinetSameDayAppointments(
      organizationId,
      detail?.patient?._id ?? undefined,
      detail?.appointment?.date,
      appointmentId,
    );

  const { data: appointmentReceipts = [] } = useSupabaseGabinetReceiptsByAppointment(
    organizationId,
    appointmentId,
  );

  // Which additional same-day appointments to include in the batch settlement.
  const [selectedAdditionalIds, setSelectedAdditionalIds] = useState<Set<string>>(
    new Set(),
  );
  const prevSameDayLengthRef2 = useRef<number>(-1);
  useEffect(() => {
    if (!sameDayOtherAppointments) return;
    if (prevSameDayLengthRef2.current === sameDayOtherAppointments.length) return;
    prevSameDayLengthRef2.current = sameDayOtherAppointments.length;
    setSelectedAdditionalIds(new Set(sameDayOtherAppointments.map((a) => a.id)));
  }, [sameDayOtherAppointments]);

  const toggleAdditional = useCallback((id: string, checked: boolean) => {
    setSelectedAdditionalIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Equipment list used to surface parameter units on the Documentation tab —
  // when the appointment's treatment lists required equipment, the editor
  // pre-fills the unit field with that equipment's catalog. See #1847.
  const { data: orgEquipment } =
    useSupabaseGabinetEquipmentList(organizationId);
  const equipmentParameterUnits = useMemo(() => {
    const requiredIds =
      (detail?.treatment?.requiredEquipmentIds as string[] | undefined) ?? [];
    if (requiredIds.length === 0 || !orgEquipment) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const eq of orgEquipment) {
      if (!requiredIds.includes(eq._id)) continue;
      for (const u of eq.parameterUnits ?? []) {
        const trimmed = u.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        out.push(trimmed);
      }
    }
    return out;
  }, [detail?.treatment?.requiredEquipmentIds, orgEquipment]);

  // Initialize internal notes from appointment data
  useEffect(() => {
    if (detail?.appointment.internalNotes) {
      setInternalNotes(detail.appointment.internalNotes);
    }
  }, [detail?.appointment.internalNotes]);

  // Seed editable scheduling state once per appointment so a refetch after
  // status/notes changes does not clobber an in-progress edit. Same pattern as
  // the calendar appointment preview (issue #620).
  const schedulingInitRef = useRef<string | null>(null);
  useEffect(() => {
    if (!detail) return;
    if (schedulingInitRef.current === detail.appointment._id) return;
    schedulingInitRef.current = detail.appointment._id;
    const appt = detail.appointment as Record<string, unknown>;
    const junctionTreatmentId = detail.treatments?.[0]?.treatmentId ?? null;
    setEditTreatmentId(
      junctionTreatmentId
        ? junctionTreatmentId
        : appt.treatmentId
          ? String(appt.treatmentId)
          : "",
    );
  }, [detail]);

  // Initialize tagIds from appointment data
  useEffect(() => {
    setTagIds(
      (detail?.appointment.tagIds as Id<"tagDefinitions">[] | undefined) ?? [],
    );
  }, [detail?.appointment._id, detail?.appointment.tagIds]);

  // Track recently viewed
  useEffect(() => {
    if (detail && organizationId) {
      const label =
        `${detail.treatment?.name ?? t("gabinet.appointments.appointment")} - ${detail.patient?.firstName ?? ""} ${detail.patient?.lastName ?? ""}`.trim();
      trackView({
        organizationId,
        entityType: "gabinetAppointments",
        entityId: appointmentId,
        entityLabel: label,
      });
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
      setTagIds(
        (detail.appointment.tagIds as Id<"tagDefinitions">[] | undefined) ?? [],
      );
    } finally {
      setIsSavingTags(false);
    }
  };

  // Build fields for EntityDetailLayout sidebar
  const detailFields: DetailField[] = (() => {
    if (!detail) return [];
    const { appointment: appt, treatment: treat } = detail;
    const fields: DetailField[] = [
      {
        label: t("gabinet.treatments.treatment"),
        value: treat?.name ?? "-",
        fieldKey: "treatment",
      },
      {
        label: t("common.date"),
        value: new Date(appt.date).toLocaleDateString(i18n.language),
        fieldKey: "date",
      },
      {
        label: t("common.time"),
        value: `${appt.startTime?.substring(0, 5) ?? ""} - ${appt.endTime?.substring(0, 5) ?? ""}`,
        fieldKey: "time",
      },
    ];
    if (treat?.price !== undefined) {
      fields.push({
        label: t("common.price"),
        value: formatCurrencyPLN(treat.price, treat.currency ?? "PLN"),
        fieldKey: "price",
      });
    }
    if (
      (appt.status === "completed" || appt.status === "cancelled") &&
      appt.updatedAt
    ) {
      fields.push({
        label:
          appt.status === "completed"
            ? t("gabinet.appointments.completedAt", "Zakończono")
            : t("gabinet.appointments.cancelledAt", "Anulowano"),
        value: new Date(appt.updatedAt).toLocaleString(i18n.language),
        fieldKey: "statusDate",
      });
    }
    return fields;
  })();

  if (!detail && !isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-3">
          <h2 className="text-lg font-semibold">{t("common.notFound")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("common.notFoundDescription")}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/dashboard/gabinet/calendar" })}
          >
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
      const result = await updateStatus({
        organizationId,
        appointmentId: appointment._id,
        status: newStatus as
          | "scheduled"
          | "confirmed"
          | "in_progress"
          | "completed"
          | "cancelled"
          | "no_show"
          | "pending_confirmation",
      });
      toast.success(t("gabinet.appointments.statusUpdated"));
      if (result?.warnings && result.warnings.length > 0) {
        toast.warning(t("gabinet.stock.negativeWarning"));
      }
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
    // Document gate: during_visit docs must be filled before completion.
    // (after_completion docs are auto-generated on completion and filled after.)
    if (newStatus === "completed" && docCounts.missingDuring > 0) {
      setGateTiming("during_visit");
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
      await invalidateAppointmentCaches();
      refetch();
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSendReminder = async () => {
    setIsSendingReminder(true);
    try {
      await sendReminderNow({
        organizationId,
        appointmentId: appointmentId as string,
      });
      toast.success(t("gabinet.appointments.reminderSent"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    } finally {
      setIsSendingReminder(false);
    }
  };

  const handleSaveInternalNotes = async () => {
    setIsSavingNotes(true);
    try {
      await updateAppointment({
        organizationId,
        appointmentId: appointment._id,
        internalNotes: internalNotes.trim() || null,
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

  const handleSaveTreatment = async (newTreatmentId: string) => {
    if (!newTreatmentId) return;
    setIsSavingTreatment(true);
    try {
      await updateAppointment({
        organizationId,
        appointmentId: appointment._id,
        treatmentId: newTreatmentId,
      });
      toast.success(t("common.saved"));
      refetch();
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    } finally {
      setIsSavingTreatment(false);
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

  const handleDownloadReceipt = async (paymentId: string) => {
    setGeneratingReceiptFor(paymentId);
    try {
      const result = await generatePdfReceipt({
        organizationId,
        paymentId,
      });
      if (result.pdfUrl) {
        window.open(result.pdfUrl, "_blank", "noopener,noreferrer");
      } else {
        toast.error(t("gabinet.receipts.noUrl"));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    } finally {
      setGeneratingReceiptFor(null);
    }
  };

  // Calculate payment summary. Credit applied from the patient's overpayment
  // balance (issue #1059) counts toward the paid total alongside `amount` —
  // a visit settled purely from credit lands as `amount=0, creditApplied=price`
  // (#1856), so without summing creditApplied the outstanding would stay at
  // the full visit price even after settlement.
  // Multi-treatment visits (#3356): the amount due is the SUM of all junction
  // rows, not the single resolved treatment's price. priceAtBooking is frozen
  // at booking; fall back to the current catalog price, then to the legacy
  // single-treatment price for pre-junction appointments.
  const junctionTreatments = detail?.treatments ?? [];
  const treatmentPrice =
    junctionTreatments.length > 0
      ? junctionTreatments.reduce((sum, jt) => {
          const tr = treatmentsList?.find((t) => t._id === jt.treatmentId);
          return sum + (jt.priceAtBooking ?? tr?.price ?? 0);
        }, 0)
      : (treatment?.price ?? 0);
  const totalPaid = payments
    .filter((p: Record<string, unknown>) => p.status === "completed")
    .reduce(
      (sum: number, p: Record<string, unknown>) =>
        sum +
        ((p.amount as number | null) ?? 0) +
        ((p.creditApplied as number | null) ?? 0),
      0,
    );
  const outstanding = treatmentPrice - totalPaid;

  const allTransitions = VALID_TRANSITIONS[appointment.status] ?? [];
  const availableTransitions = canDelete
    ? allTransitions
    : allTransitions.filter((s) => s !== "cancelled");
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
  const smsSummary = getSmsSummary(
    smsEvents as Array<Record<string, unknown>>,
    appointment.status,
  );

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
    automationRuns: automationRuns.map((r) => ({
      _id: r._id,
      ruleName: undefined,
      status: r.status,
      createdAt: r.createdAt,
      actionsSummary: undefined,
    })) satisfies AutomationRunEntry[],
    t,
  });

  // Header title and subtitle
  const headerTitle =
    `${treatment?.name ?? t("gabinet.appointments.appointment")} - ${patient?.firstName ?? ""} ${patient?.lastName ?? ""}`.trim();
  const linkedPackageUsage = appointment.packageUsageId
    ? (patientPackageUsage.find(
        (p) => String(p._id) === String(appointment.packageUsageId),
      ) ?? null)
    : null;
  const headerSubtitle = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 whitespace-normal">
      <span>
        {formatDate(appointment.date)} &bull;{" "}
        {formatTime(appointment.startTime)} - {formatTime(appointment.endTime)}
      </span>
      {appointment.packageUsageId && (
        <Badge
          variant="outline"
          className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
        >
          <Package className="h-3 w-3" variant="stroke" />
          <span className="truncate max-w-[180px]">
            {linkedPackageUsage?.packageName
              ? t("gabinet.packages.partOfPackage", {
                  name: linkedPackageUsage.packageName,
                })
              : t("gabinet.packages.partOfPackageGeneric")}
          </span>
        </Badge>
      )}
    </span>
  );

  // Helper: document badge count for status transitions
  const getDocBadgeCount = (status: string): number => {
    if (status === "in_progress") return docCounts.missingBefore;
    if (status === "completed") return docCounts.missingDuring;
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

  // Status dropdown as actions menu — only shown when user has edit permission
  const statusAction =
    canEdit && availableTransitions.length > 0 ? (
      <Select
        value={appointment.status}
        onValueChange={(value) => handleStatusChange(value)}
        disabled={isUpdating}
      >
        <SelectTrigger className="h-9 w-auto gap-2 text-sm font-medium">
          <span className="flex items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${statusDotColors[appointment.status] ?? "bg-muted-foreground"}`}
            />
            {t(`gabinet.appointments.statuses.${appointment.status}`)}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={appointment.status} disabled>
            <span className="flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${statusDotColors[appointment.status] ?? "bg-muted-foreground"}`}
              />
              {t(`gabinet.appointments.statuses.${appointment.status}`)}
            </span>
          </SelectItem>
          {availableTransitions.map((status) => {
            const docBadge = getDocBadgeCount(status);
            return (
              <SelectItem key={status} value={status}>
                <span className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${statusDotColors[status] ?? "bg-muted-foreground"}`}
                  />
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
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${statusDotColors[appointment.status] ?? "bg-muted-foreground"}`}
        />
        {t(`gabinet.appointments.statuses.${appointment.status}`)}
      </span>
    );

  // Sidebar extra: patient card, employee card, packages/loyalty/tags
  const apptTreatmentIds = new Set(
    (detail.treatments ?? [])
      .map((jt) => jt.treatmentId)
      .filter((id): id is string => Boolean(id)),
  );
  const relevantPkgs = (patientPackageUsage ?? []).filter((pkg) =>
    pkg.treatmentsUsed.some((tu) => apptTreatmentIds.has(tu.treatmentId)),
  );

  const sidebarExtra = patient ? (
    <AppointmentSidebarExtra
      patient={patient}
      employee={employee}
      relevantPkgs={relevantPkgs}
      loyaltyBalance={loyaltyBalance}
      tagDefinitions={tagDefinitions}
      tagIds={tagIds}
      isSavingTags={isSavingTags}
      canEdit={canEdit}
      onChangeEmployee={() => setChangeEmployeeOpen(true)}
      onTagsChange={handleTagsChange}
      t={t}
    />
  ) : null;

  // Build tabs array
  const tabs = [
    {
      label: t("gabinet.appointments.tabs.details"),
      content: (
        <AppointmentDetailsTab
          appointment={appointment}
          treatment={treatment}
          employee={employee}
          junctionTreatments={junctionTreatments}
          treatmentsList={treatmentsList}
          smsSummary={smsSummary}
          latestOutboundSms={latestOutboundSms as Record<string, unknown> | undefined}
          latestInboundSms={latestInboundSms as Record<string, unknown> | undefined}
          internalNotes={internalNotes}
          isSavingNotes={isSavingNotes}
          canEdit={canEdit}
          isSavingTreatment={isSavingTreatment}
          editTreatmentId={editTreatmentId}
          treatmentPickerOpen={treatmentPickerOpen}
          treatmentSearch={treatmentSearch}
          onTreatmentPickerOpenChange={setTreatmentPickerOpen}
          onTreatmentSearchChange={setTreatmentSearch}
          onTreatmentSelect={(id) => {
            setEditTreatmentId(id);
            void handleSaveTreatment(id);
          }}
          onInternalNotesChange={setInternalNotes}
          onSaveInternalNotes={handleSaveInternalNotes}
          onMarkContraindicationReviewed={async () => {
            try {
              await updateAppointment({
                organizationId,
                appointmentId: appointment._id,
                contraindicationAlertsReviewed: true,
              });
              await refetch();
              toast.success(
                t(
                  "gabinet.appointmentDetail.contraindicationMarked",
                  "Oznaczono jako omówione",
                ),
              );
            } catch {
              toast.error(t("common.errorOccurred", "Wystąpił błąd"));
            }
          }}
          calculateDuration={calculateDuration}
          getEmployeeName={getEmployeeName}
          getEmployeeInitials={getEmployeeInitials}
          language={i18n.language}
          t={t}
        />
      ),
    },
    {
      label: t("gabinet.payments.payments"),
      count: payments.length,
      content: (
        <AppointmentPaymentsTab
          appointment={appointment}
          payments={payments as Record<string, unknown>[]}
          junctionTreatments={junctionTreatments}
          treatmentPrice={treatmentPrice}
          totalPaid={totalPaid}
          outstanding={outstanding}
          linkedPackageUsage={linkedPackageUsage}
          canCreatePayment={canCreatePayment}
          canEditPayment={canEditPayment}
          canRefundPayment={canRefundPayment}
          canGenerateReceipt={canGenerateReceipt}
          generatingReceiptFor={generatingReceiptFor}
          onAddPayment={() => setPaymentDialogOpen(true)}
          onMarkPaid={handleMarkPaid}
          onRefundPayment={handleRefundPayment}
          onDownloadReceipt={handleDownloadReceipt}
          language={i18n.language}
          t={t}
        />
      ),
    },
    {
      label: t("gabinet.patients.history"),
      content: (
        <AppointmentHistoryTab
          mergedTimeline={mergedTimeline}
          patientHistory={patientHistory}
          patientPackageUsage={patientPackageUsage}
          loyaltyBalance={loyaltyBalance}
          loyaltyTier={loyaltyTier as string | null | undefined}
          loyaltyTransactions={loyaltyTransactions as Record<string, unknown>[] | null | undefined}
          allPatientPayments={allPatientPayments as Record<string, unknown>[] | null | undefined}
          canEdit={canEdit}
          onUseMultiple={(pkg) => {
            setUsageDialogPkgId(pkg._id);
            setUsageDialogItems(
              pkg.treatmentsUsed
                .filter(
                  (e) => (e.usedCount ?? 0) < (e.totalCount ?? 0),
                )
                .map((e) => ({
                  treatmentId: e.treatmentId,
                  variantId: (e as any).variantId ?? undefined,
                  treatmentName:
                    e.treatmentName ?? t("gabinet.packages.treatment"),
                  remaining: (e.totalCount ?? 0) - (e.usedCount ?? 0),
                  qty: 0,
                })),
            );
            setUsageDialogOpen(true);
          }}
          formatDate={formatDate}
          formatTime={formatTime}
          language={i18n.language}
          t={t}
        />
      ),
    },
    {
      label: t("gabinet.appointments.tabs.documentation", "Notatki z wizyty"),
      content: (
        <DocumentationTab
          organizationId={organizationId}
          appointmentId={appointment._id}
          appointment={appointment}
          treatmentParameters={treatment?.parameters as any}
          equipmentParameterUnits={equipmentParameterUnits}
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
          treatmentId={detail.treatments?.[0]?.treatmentId ?? undefined}
        />
      ),
    },
    {
      label: t("gabinet.receipts.receiptHistory", "Paragony"),
      count: appointmentReceipts.length > 0 ? appointmentReceipts.length : undefined,
      content: (
        <AppointmentReceiptsTab
          appointmentReceipts={appointmentReceipts}
          language={i18n.language}
          t={t}
        />
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
        avatarFallback={
          patient
            ? `${patient.firstName?.[0] ?? ""}${patient.lastName?.[0] ?? ""}`.toUpperCase()
            : "?"
        }
        actionsMenu={statusAction}
        quickActionItems={
          canEdit &&
          appointment.status !== "cancelled" &&
          appointment.status !== "completed" &&
          appointment.status !== "no_show"
            ? [
                {
                  key: "sendReminder",
                  label: isSendingReminder
                    ? t("common.processing")
                    : t("gabinet.appointments.sendReminder"),
                  icon: <Send size={14} variant="stroke" />,
                  onClick: handleSendReminder,
                },
              ]
            : undefined
        }
        fields={detailFields}
        expandedFieldCount={5}
        sidebarExtra={sidebarExtra}
        tabs={tabs}
        defaultTab={
          tabSearch === "payments"
            ? t("gabinet.payments.payments")
            : tabSearch === "documentation"
              ? t("gabinet.appointments.tabs.documentation", "Notatki z wizyty")
              : tabSearch === "receipts"
                ? t("gabinet.receipts.receiptHistory", "Paragony")
                : undefined
        }
      />

      {/* Change Employee Modal */}
      {detail && (
        <ChangeEmployeeModal
          open={changeEmployeeOpen}
          onOpenChange={setChangeEmployeeOpen}
          organizationId={organizationId}
          appointmentId={appointmentId as Id<"gabinetAppointments">}
          treatmentIds={
            (detail.treatments?.map((t) => t.treatmentId) ??
              []) as Id<"gabinetTreatments">[]
          }
          currentEmployeeId={detail.appointment.employeeId}
          appointmentDate={detail.appointment.date}
          startTime={detail.appointment.startTime}
          endTime={detail.appointment.endTime}
          durationMinutes={detail.treatment?.duration ?? 30}
        />
      )}

      {/* Cancel Dialog */}
      <CancelAppointmentDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        cancelReason={cancelReason}
        isUpdating={isUpdating}
        onCancelReasonChange={setCancelReason}
        onConfirm={handleCancelConfirm}
        t={t}
      />

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
      <PaymentAppointmentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        organizationId={organizationId}
        appointmentId={appointment._id}
        patientId={patient!._id}
        junctionTreatments={junctionTreatments}
        legacyTreatmentPrice={treatment?.price}
        treatmentsList={treatmentsList}
        payments={payments as Array<Record<string, unknown>>}
        patientPackageUsage={patientPackageUsage}
        linkedPackageUsageId={appointment.packageUsageId ?? null}
        sameDayOtherAppointments={sameDayOtherAppointments}
        selectedAdditionalIds={selectedAdditionalIds}
        availableTransitions={availableTransitions}
        onToggleAdditional={toggleAdditional}
        onMarkCompleted={async () => {
          const result = await updateStatus({
            organizationId,
            appointmentId: appointment._id,
            status: "completed",
          });
          if (result?.warnings?.length) {
            toast.warning(t("gabinet.stock.negativeWarning"));
          }
          await invalidateAppointmentCaches();
          setTimeout(() => setAfterCompletionDialogOpen(true), 500);
        }}
        onSuccess={() => {
          setPaymentDialogOpen(false);
          refetch();
        }}
        onCancel={() => setPaymentDialogOpen(false)}
        t={t}
      />

      {/* Multi-treatment package usage dialog */}
      <PackageUsageDialog
        open={usageDialogOpen}
        onOpenChange={setUsageDialogOpen}
        usageDialogItems={usageDialogItems}
        isUsageSubmitting={isUsageSubmitting}
        onItemQtyChange={(idx, val) =>
          setUsageDialogItems((prev) =>
            prev.map((it, i) => (i === idx ? { ...it, qty: val } : it)),
          )
        }
        onSubmit={async () => {
          if (!usageDialogPkgId) return;
          const items = usageDialogItems
            .filter((it) => it.qty > 0)
            .map((it) => ({
              treatmentId: it.treatmentId,
              ...(it.variantId ? { variantId: it.variantId } : {}),
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
        t={t}
      />
    </>
  );
}
