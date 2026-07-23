import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatPhoneNumber } from "@/lib/phone";
import { formatCurrencyPLN } from "@/lib/format-currency";
import {
  formatActionError,
  formatAppointmentError,
} from "@/lib/format-action-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { TimePicker5Min } from "@/components/gabinet/calendar/time-picker-5min";
import { DocumentGateDialog } from "@/components/documents/document-gate-dialog";
import { useAppointmentDocumentCounts } from "@/components/documents/appointment-document-checklist";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getAppointmentJunctionPrice } from "@/lib/gabinet/appointment-display";
import {
  BadgeCheck,
  Calendar,
  ChevronDown,
  CircleCheck,
  Clock,
  History,
  Mail,
  OctagonX,
  Phone,
  PlayCircle,
  Sparkles,
  Stethoscope,
  XCircle,
} from "@/lib/ez-icons";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  ExternalLink,
  Plus,
  X,
} from "lucide-react";
import { useSupabaseActivitiesByEntity } from "@/hooks/use-supabase-activities";
import {
  getActionFallbackLabel,
  translateActivityDescription,
} from "@/components/activity-timeline/translate-description";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useDraggableDialog } from "@/hooks/use-draggable-dialog";
import { useSidebarActions } from "@/components/layout/sidebar-context";
import {
  useSupabaseGabinetFirstAppointmentIdsByPatient,
  useSupabaseGabinetAppointmentPackagePositions,
  useSupabaseGabinetAppointmentRecurringPositions,
} from "@/hooks/use-supabase-gabinet-appointments";
import {
  AppointmentIndicatorBadge,
  type AppointmentIndicator,
} from "./appointment-indicators";
import { StockShortageWarning } from "@/components/gabinet/appointment-shared/warnings";
import { useAppointmentShortage } from "@/components/gabinet/appointment-shared/use-appointment-warnings";
import { SettlementForm } from "@/components/gabinet/appointment-shared/settlement-form";

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

const STATUS_DOT_COLORS: Record<string, string> = {
  pending_confirmation: "bg-amber-400",
  scheduled: "bg-blue-400",
  confirmed: "bg-emerald-400",
  in_progress: "bg-yellow-400",
  completed: "bg-gray-400",
  cancelled: "bg-red-400",
  no_show: "bg-orange-400",
};

type AppointmentStatus =
  | "pending_confirmation"
  | "scheduled"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

const STATUS_ORDER: AppointmentStatus[] = [
  "pending_confirmation",
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
];

const STATUS_ICONS: Record<
  AppointmentStatus,
  React.ComponentType<{ className?: string }>
> = {
  pending_confirmation: Clock,
  scheduled: Calendar,
  confirmed: BadgeCheck,
  in_progress: PlayCircle,
  completed: CircleCheck,
  cancelled: XCircle,
  no_show: OctagonX,
};

const STATUS_ACTIVE_CLASSES: Record<AppointmentStatus, string> = {
  pending_confirmation:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  scheduled:
    "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  confirmed:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  in_progress:
    "border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300",
  completed:
    "border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300",
  cancelled:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
  no_show:
    "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
};

const STATUS_HOVER_CLASSES: Record<AppointmentStatus, string> = {
  pending_confirmation:
    "hover:border-amber-300 hover:text-amber-700 dark:hover:text-amber-300",
  scheduled:
    "hover:border-blue-300 hover:text-blue-700 dark:hover:text-blue-300",
  confirmed:
    "hover:border-emerald-300 hover:text-emerald-700 dark:hover:text-emerald-300",
  in_progress:
    "hover:border-yellow-300 hover:text-yellow-700 dark:hover:text-yellow-300",
  completed:
    "hover:border-gray-300 hover:text-gray-700 dark:hover:text-gray-300",
  cancelled: "hover:border-red-300 hover:text-red-700 dark:hover:text-red-300",
  no_show:
    "hover:border-orange-300 hover:text-orange-700 dark:hover:text-orange-300",
};

interface AppointmentPreviewContentProps {
  appointmentId: string;
  onClose: () => void;
  // Touch-only drag handler from the parent popover. When provided, the
  // title row acts as the popover's drag affordance on touch devices
  // (issue #1626 follow-up) — replaces the separate grab strip removed in
  // the #1738 redesign.
  titleDragHandler?: (e: React.PointerEvent<HTMLDivElement>) => void;
  isPreviewDragging?: boolean;
  dragToMoveLabel?: string;
}

export function AppointmentPreviewContent({
  appointmentId,
  onClose,
  titleDragHandler,
  isPreviewDragging,
  dragToMoveLabel,
}: AppointmentPreviewContentProps) {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const getFullDetail = useAction(api.gabinet.appointments.getFullDetail);
  const updateAppointment = useAction(api.gabinet.appointments.update);
  const updateStatus = useAction(api.gabinet.appointments.updateStatus);
  const updatePatient = useAction(api.gabinet.patients.update);
  const getWarnings = useAction(api.gabinet.appointments.getWarnings);
  const listActiveTreatments = useAction(api.gabinet.treatments.listActive);
  const listVariantsAction = useAction(api.gabinet.treatments.listVariants);
  const getPatientPackagesEnriched = useAction(
    api.gabinet.packages.getPatientPackagesEnriched,
  );

  const {
    data: detail,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["gabinet.appointment.fullDetail", organizationId, appointmentId],
    queryFn: () =>
      getFullDetail({
        organizationId,
        appointmentId,
      }),
    enabled: !!organizationId && !!appointmentId,
  });

  const { data: warningsData } = useQuery({
    queryKey: ["gabinet.appointment.warnings", organizationId, appointmentId],
    queryFn: () =>
      getWarnings({
        organizationId,
        appointmentId,
      }),
    enabled: !!organizationId && !!appointmentId,
  });
  const warnings = warningsData?.warnings ?? [];

  const { data: treatments } = useQuery({
    queryKey: ["gabinet.treatments.listActive", organizationId],
    queryFn: () => listActiveTreatments({ organizationId }),
    enabled: !!organizationId,
  }) as {
    data:
      | Array<{ _id: string; name: string; duration: number; price?: number }>
      | undefined;
  };

  // Patient's enriched package usage — drives the "deduct from active package"
  // section of the settle dialog (issue #1697). We need the enriched shape
  // because the per-treatment progress is what tells us whether this visit's
  // treatment can be covered by a package the patient already has.
  const patientIdForPackages = detail?.appointment.patientId
    ? String(detail.appointment.patientId)
    : "";
  const { data: patientPackagesEnriched } = useQuery({
    queryKey: [
      "gabinet.packages.getPatientPackagesEnriched",
      organizationId,
      patientIdForPackages,
    ],
    queryFn: () =>
      getPatientPackagesEnriched({
        organizationId,
        patientId: patientIdForPackages,
      }),
    enabled: !!organizationId && !!patientIdForPackages,
  }) as {
    data:
      | Array<{
          _id: string;
          packageId: string;
          packageName: string | null;
          status: string;
          expiresAt?: number | null;
          treatmentsUsed: Array<{
            treatmentId: string;
            treatmentName: string | null;
            usedCount: number;
            totalCount: number;
          }>;
        }>
      | undefined;
  };

  const [status, setStatus] = useState<AppointmentStatus | "">("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [changeHistoryOpen, setChangeHistoryOpen] = useState(false);

  // Appointment change history (issue #1837). Activities are recorded by the
  // backend on every update — we surface only the ones that meaningfully
  // describe a change ("updated", "status_changed") and show who/when/what.
  const { data: appointmentActivities } = useSupabaseActivitiesByEntity(
    organizationId,
    "gabinetAppointment",
    appointmentId,
    { enabled: changeHistoryOpen, limit: 50 },
  );

  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart);
    if (!newStart || !startTime || !endTime) return;
    const toMin = (s: string) => {
      const [h, m] = s.split(":").map(Number);
      return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
    };
    const oldStart = toMin(startTime);
    const oldEnd = toMin(endTime);
    const next = toMin(newStart);
    if (oldStart === null || oldEnd === null || next === null) return;
    const duration = oldEnd - oldStart;
    if (duration <= 0) return;
    const newEnd = Math.min(next + duration, 24 * 60 - 1);
    const eh = Math.floor(newEnd / 60);
    const em = newEnd % 60;
    setEndTime(`${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`);
  };
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [treatmentId, setTreatmentId] = useState("");
  const [variantId, setVariantId] = useState("");
  const { data: variants } = useQuery({
    queryKey: ["gabinet.treatments.listVariants", organizationId, treatmentId],
    queryFn: () => listVariantsAction({ organizationId, treatmentId }),
    enabled: !!organizationId && !!treatmentId,
  }) as {
    data:
      | Array<{
          _id: string;
          name: string;
          resolvedDuration: number | null;
          resolvedPrice: number | null;
        }>
      | undefined;
  };
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const [treatmentSearch, setTreatmentSearch] = useState("");
  const [tagIds, setTagIds] = useState<Array<Id<"tagDefinitions">>>([]);
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [gateDialogOpen, setGateDialogOpen] = useState(false);
  const [gateTiming, setGateTiming] = useState<"before_start" | "during_visit">(
    "before_start",
  );
  const [gateTargetStatus, setGateTargetStatus] =
    useState<AppointmentStatus>("in_progress");
  const [settleDialogOpen, setSettleDialogOpen] = useState(false);
  // Drag-to-reposition for the sub-dialogs that open from the preview popover
  // (issue #1548). Same drag-from-anywhere behaviour as the appointment dialog
  // and preview popover (#1459, #1476) — users want to peek at what's behind
  // these modal confirmations without dismissing them first.
  const cancelDrag = useDraggableDialog(cancelDialogOpen);
  const settleDrag = useDraggableDialog(settleDialogOpen);

  const { tags: tagDefinitions } = useTagDefinitions(organizationId);
  const { dispatch } = useSidebarActions();

  const docCounts = useAppointmentDocumentCounts(appointmentId, organizationId);

  // Indicator lookups — mirror the per-card badges the calendar route renders
  // (issue #730). Hooks must run before the early return so React keeps a
  // stable hook order; each hook disables itself when its input array is empty.
  const indicatorPatientIds = detail?.appointment.patientId
    ? [String(detail.appointment.patientId)]
    : [];
  const indicatorPackageUsageIds = detail?.appointment.packageUsageId
    ? [String(detail.appointment.packageUsageId)]
    : [];
  const indicatorRecurringGroupIds = detail?.appointment.recurringGroupId
    ? [String(detail.appointment.recurringGroupId)]
    : [];

  const { data: firstAppointmentIds } =
    useSupabaseGabinetFirstAppointmentIdsByPatient(
      organizationId,
      indicatorPatientIds,
    );
  const { data: packagePositions } =
    useSupabaseGabinetAppointmentPackagePositions(
      organizationId,
      indicatorPackageUsageIds,
    );
  const { data: recurringPositions } =
    useSupabaseGabinetAppointmentRecurringPositions(
      organizationId,
      indicatorRecurringGroupIds,
    );

  const { shortageItems, hasShortage } = useAppointmentShortage({
    organizationId,
    treatmentId,
    locationId: detail?.appointment.locationId
      ? String(detail.appointment.locationId)
      : undefined,
  });

  // Only seed local form state from `detail` once per appointment. Refetches
  // triggered by status changes must not clobber the user's other unsaved edits
  // (notes, date/time, tags, treatment). Issue #620.
  const initializedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!detail) return;
    if (initializedRef.current === appointmentId) return;
    initializedRef.current = appointmentId;
    const appt = detail.appointment;
    setStatus(appt.status as AppointmentStatus);
    setDate(appt.date);
    setStartTime(appt.startTime.slice(0, 5));
    setEndTime(appt.endTime.slice(0, 5));
    setNotes(appt.notes ?? "");
    setInternalNotes(appt.internalNotes ?? "");
    setTreatmentId(detail.treatments?.[0]?.treatmentId ?? "");
    setVariantId("");
    setTagIds((appt.tagIds ?? []).map((id) => id as Id<"tagDefinitions">));
  }, [detail, appointmentId]);

  if (isLoading || !detail) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const { appointment, patient, treatment } = detail;
  const initialStatus = appointment.status as AppointmentStatus;
  const junctionTreatments = detail.treatments ?? [];
  const isMultiTreatment = junctionTreatments.length > 1;
  const initialTreatmentId = detail.treatments?.[0]?.treatmentId ?? "";
  const initialVariantId = "";
  const availableTransitions = VALID_TRANSITIONS[initialStatus] ?? [];
  const patientFullName = patient
    ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim()
    : "-";

  const selectedTreatment =
    treatments?.find((tr) => tr._id === treatmentId) ?? null;
  const treatmentDisplayName = selectedTreatment?.name ?? treatment?.name ?? "";
  const selectedVariantName =
    variants?.find((v) => v._id === variantId)?.name ?? "";
  const filteredTreatments = (() => {
    const all = treatments ?? [];
    const q = treatmentSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((tr) => (tr.name ?? "").toLowerCase().includes(q));
  })();

  const phoneDirty =
    isEditingPhone &&
    phoneInput.trim().length > 0 &&
    phoneInput.trim() !== (patient?.phone ?? "");

  const initialTagIds = (appointment.tagIds ?? []).map((id) => String(id));
  const currentTagIds = tagIds.map((id) => String(id));
  const tagsDirty =
    initialTagIds.length !== currentTagIds.length ||
    initialTagIds.some((id) => !currentTagIds.includes(id));

  const apptDirty =
    date !== appointment.date ||
    startTime !== appointment.startTime.slice(0, 5) ||
    endTime !== appointment.endTime.slice(0, 5) ||
    notes !== (appointment.notes ?? "") ||
    internalNotes !== (appointment.internalNotes ?? "") ||
    treatmentId !== initialTreatmentId ||
    variantId !== initialVariantId ||
    tagsDirty;

  const dirty = phoneDirty || apptDirty;

  const handleSavePhone = async () => {
    const trimmed = phoneInput.trim();
    if (!trimmed || savingPhone || !patient?._id) return;
    setSavingPhone(true);
    try {
      await updatePatient({
        organizationId,
        patientId: patient._id,
        phone: trimmed,
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: supabaseKeys.gabinetPatients.detail(
            organizationId,
            patient._id,
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: supabaseKeys.gabinetPatients.list(organizationId),
        }),
      ]);
      await refetch();
      setIsEditingPhone(false);
      setPhoneInput("");
      toast.success(t("gabinet.appointmentDetail.phoneAdded"));
    } catch (error) {
      console.error("[appointment-preview] phone save failed", error);
      toast.error(
        formatActionError(error, t, {
          key: "common.errors.invalidArguments",
          defaultValue: "Nie udało się zapisać. Spróbuj ponownie.",
        }),
      );
    } finally {
      setSavingPhone(false);
    }
  };

  const performStatusChange = async (newStatus: AppointmentStatus) => {
    if (savingStatus) return;
    const previous = status;
    setStatus(newStatus);
    setSavingStatus(true);
    try {
      const result = await updateStatus({
        organizationId,
        appointmentId: appointment._id,
        status: newStatus,
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: supabaseKeys.gabinetAppointments.all,
        }),
        queryClient.invalidateQueries({
          queryKey: supabaseKeys.scheduledActivities.all,
        }),
      ]);
      await refetch();
      toast.success(t("gabinet.appointments.statusUpdated"));
      if (result?.warnings && result.warnings.length > 0) {
        toast.warning(t("gabinet.stock.negativeWarning"));
      }
    } catch (error) {
      setStatus(previous);
      console.error("[appointment-preview] status update failed", error);
      toast.error(
        formatAppointmentError(error, t, {
          key: "gabinet.appointments.updateFailed",
          defaultValue: "Nie udało się zapisać zmian.",
        }),
      );
    } finally {
      setSavingStatus(false);
    }
  };

  const handleStatusChange = (newStatus: AppointmentStatus) => {
    if (newStatus === initialStatus || savingStatus) return;

    if (newStatus === "cancelled") {
      setCancelDialogOpen(true);
      return;
    }

    if (newStatus === "in_progress" && docCounts.missingBefore > 0) {
      setGateTiming("before_start");
      setGateTargetStatus("in_progress");
      setGateDialogOpen(true);
      return;
    }
    if (newStatus === "completed" && docCounts.missingDuring > 0) {
      setGateTiming("during_visit");
      setGateTargetStatus("completed");
      setGateDialogOpen(true);
      return;
    }

    void performStatusChange(newStatus);
  };

  const handleCancelConfirm = async () => {
    if (!cancelReason.trim()) {
      toast.error(t("gabinet.appointments.cancelReasonRequired"));
      return;
    }
    if (savingStatus) return;
    const previous = status;
    setSavingStatus(true);
    try {
      await updateAppointment({
        organizationId,
        appointmentId: appointment._id as Id<"gabinetAppointments">,
        status: "cancelled",
        cancellationReason: cancelReason.trim(),
      });
      setStatus("cancelled");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: supabaseKeys.gabinetAppointments.all,
        }),
        queryClient.invalidateQueries({
          queryKey: supabaseKeys.scheduledActivities.all,
        }),
      ]);
      await refetch();
      setCancelDialogOpen(false);
      setCancelReason("");
      toast.success(t("gabinet.appointments.cancelled"));
    } catch (error) {
      setStatus(previous);
      console.error("[appointment-preview] cancel failed", error);
      toast.error(
        formatAppointmentError(error, t, {
          key: "gabinet.appointments.updateFailed",
          defaultValue: "Nie udało się zapisać zmian.",
        }),
      );
    } finally {
      setSavingStatus(false);
    }
  };

  const handleSave = async (closeAfter = true) => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      if (phoneDirty && patient?._id) {
        await updatePatient({
          organizationId,
          patientId: patient._id,
          phone: phoneInput.trim(),
        });
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: supabaseKeys.gabinetPatients.detail(
              organizationId,
              patient._id,
            ),
          }),
          queryClient.invalidateQueries({
            queryKey: supabaseKeys.gabinetPatients.list(organizationId),
          }),
        ]);
        setIsEditingPhone(false);
        setPhoneInput("");
      }

      if (apptDirty) {
        const args: Parameters<typeof updateAppointment>[0] = {
          organizationId,
          appointmentId: appointment._id as Id<"gabinetAppointments">,
        };
        if (date !== appointment.date) args.date = date;
        if (startTime !== appointment.startTime.slice(0, 5))
          args.startTime = startTime;
        if (endTime !== appointment.endTime.slice(0, 5)) args.endTime = endTime;
        if (notes !== (appointment.notes ?? "")) args.notes = notes || null;
        if (internalNotes !== (appointment.internalNotes ?? ""))
          args.internalNotes = internalNotes || null;
        if (treatmentId && treatmentId !== initialTreatmentId)
          args.treatmentId = treatmentId;
        if (variantId !== initialVariantId) args.variantId = variantId || null;
        if (tagsDirty) args.tagIds = tagIds.map((id) => String(id));

        await updateAppointment(args);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: supabaseKeys.gabinetAppointments.all,
          }),
          queryClient.invalidateQueries({
            queryKey: supabaseKeys.scheduledActivities.all,
          }),
        ]);
      }

      await refetch();
      toast.success(t("gabinet.appointments.updated"));
      if (closeAfter) onClose();
    } catch (error) {
      console.error("[appointment-preview] save failed", error);
      toast.error(
        formatAppointmentError(error, t, {
          key: "gabinet.appointments.updateFailed",
          defaultValue: "Nie udało się zapisać zmian.",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  // Sum prices across all junction treatments; fall back to the legacy scalar
  // for pre-junction single-treatment appointments. Fixes the "!"-unpaid
  // indicator and isSettled check for multi-treatment visits (issue #3517).
  const treatmentPrice = getAppointmentJunctionPrice(
    junctionTreatments,
    treatments,
    treatment?.price,
  );
  // Credit applied from the patient's overpayment balance (issue #1059) counts
  // toward the paid total — a visit settled purely from credit lands as
  // `amount=0, creditApplied=price` (#1856), so without summing creditApplied
  // the visit would look unpaid (red "!") even though it's fully settled.
  const totalPaid = (detail.payments ?? [])
    .filter((p) => p.status === "completed" || p.status === "pending")
    .reduce(
      (sum, p) =>
        sum +
        (p.amount ?? 0) +
        ((p as { creditApplied?: number | null }).creditApplied ?? 0),
      0,
    );
  const outstanding = Math.max(0, treatmentPrice - totalPaid);
  const canMarkCompleted = availableTransitions.includes("completed");

  // Completed-only total drives the visible paid/partial/unpaid pill in the
  // indicator row — pending payments are auto-created when an appointment is
  // booked, so they mustn't count as actually paid. Issue #1031.
  const completedPaid = (detail.payments ?? [])
    .filter((p) => p.status === "completed")
    .reduce(
      (sum, p) =>
        sum +
        (p.amount ?? 0) +
        ((p as { creditApplied?: number | null }).creditApplied ?? 0),
      0,
    );

  // Drives the "already settled" affordance on the Rozlicz button (issue #1688).
  // Settle = visit closed AND nothing left to pay; otherwise the primary button
  // stays blue so staff can finish the workflow.
  const isSettled =
    appointment.status === "completed" &&
    (treatmentPrice === 0 || completedPaid >= treatmentPrice);

  const patientCreditBalance = (detail.patientCreditBalance ?? 0) as number;

  // Compact indicator pills mirroring the calendar card surface (issue #730).
  // Same rules as `_layout.gabinet.calendar.index.lazy.tsx` so the popover
  // stays in lockstep — see that file for full context on each indicator.
  const previewIndicators: AppointmentIndicator[] = (() => {
    const out: AppointmentIndicator[] = [];
    const status = appointment.status;

    if (
      status !== "cancelled" &&
      status !== "no_show" &&
      firstAppointmentIds?.has(String(appointment._id))
    ) {
      out.push({
        kind: "firstVisit",
        label: "1",
        title: t("gabinet.calendar.indicators.firstVisit", "Pierwsza wizyta"),
      });
    }

    if (
      appointment.prepaymentRequired &&
      appointment.prepaymentStatus !== "paid"
    ) {
      out.push({
        kind: "payment",
        label: "$",
        title: t("gabinet.calendar.indicators.paymentDue", "Do zapłacenia"),
      });
    }

    const pkgPos = appointment.packageUsageId
      ? packagePositions?.get(String(appointment._id))
      : undefined;
    if (pkgPos) {
      out.push({
        kind: "count",
        label: `${pkgPos.position}/${pkgPos.total}`,
        title: t(
          "gabinet.calendar.indicators.packageVisit",
          "Wizyta pakietowa",
        ),
      });
    } else if (appointment.isRecurring && appointment.recurringRule) {
      const rule = appointment.recurringRule as { count?: number };
      if (typeof rule.count === "number" && rule.count > 0) {
        const dynamicPos = appointment.recurringGroupId
          ? recurringPositions?.get(String(appointment._id))
          : undefined;
        const pos = dynamicPos ?? (appointment.recurringIndex ?? 0) + 1;
        out.push({
          kind: "count",
          label: `${pos}/${rule.count}`,
          title: t(
            "gabinet.calendar.indicators.recurringVisit",
            "Wizyta cykliczna",
          ),
        });
      }
    }

    if (
      patientCreditBalance > 0 &&
      status !== "cancelled" &&
      status !== "no_show"
    ) {
      // The calendar surfaces this on the patient's NEXT unpaid visit only,
      // so the indicator unambiguously points to where the credit will be
      // applied (issue #1286). The popover always shows the credit when
      // there's outstanding balance on this visit and the patient has credit
      // available — staff opened this specific visit, so highlight the
      // applicability inline.
      if (treatmentPrice > 0 && completedPaid < treatmentPrice) {
        out.push({
          kind: "credit",
          label: `+${Math.round(patientCreditBalance)}`,
          title: t("gabinet.calendar.indicators.credit", {
            defaultValue: "Saldo {{amount}} do wykorzystania",
            amount: patientCreditBalance.toFixed(2),
          }),
        });
      }
    }

    if (status !== "cancelled" && treatmentPrice > 0) {
      if (completedPaid >= treatmentPrice) {
        out.push({
          kind: "paid",
          label: "✓",
          title: t("gabinet.calendar.indicators.paid", "Wizyta opłacona"),
        });
      } else if (completedPaid > 0) {
        out.push({
          kind: "partial",
          label: "½",
          title: t("gabinet.calendar.indicators.partial", "Częściowo opłacona"),
        });
      } else {
        out.push({
          kind: "unpaid",
          label: "!",
          title: t("gabinet.calendar.indicators.unpaid", "Wizyta nieopłacona"),
        });
      }
    }

    return out;
  })();

  // Full list goes to SettlementForm; the double-deduct guard for
  // package-linked appointments lives inside the form (linkedPackageUsageId),
  // which explains itself instead of showing a misleading "no packages".
  const packageUsageForSettle = patientPackagesEnriched ?? [];

  const handleNavigateToPayments = () => {
    setSettleDialogOpen(false);
    onClose();
    void navigate({
      to: "/dashboard/gabinet/appointments/$appointmentId",
      params: { appointmentId: appointment._id },
      search: { tab: "payments" },
    });
  };

  const formatDateLabel = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(i18n.language, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <>
      {/* Title bar — sticky modal-style header with a visible drag handle pill,
        patient name, and close button (issue #1886). The whole bar is the drag
        affordance: the iOS-style grip pill at the top centers a clear visual
        cue, and a distinct `bg-muted/60` background separates the header from
        the popover body so the drag area is recognisable at a glance. The
        drag handler still skips interactive children (Link, close button) so
        clicks land on them — same pattern as the body-wide drag handler in
        draggable-appointment.tsx (#1476). */}
      <div
        role={titleDragHandler ? "button" : undefined}
        aria-label={titleDragHandler ? dragToMoveLabel : undefined}
        onPointerDown={(e) => {
          if (!titleDragHandler) return;
          const target = e.target as HTMLElement | null;
          if (
            target?.closest(
              'button, a, input, textarea, select, [role="button"], [contenteditable="true"]',
            )
          ) {
            return;
          }
          titleDragHandler(e);
        }}
        className={cn(
          "sticky top-0 z-10 border-b border-border/60 bg-muted/60 backdrop-blur-sm",
          titleDragHandler &&
            (isPreviewDragging
              ? "cursor-grabbing select-none touch-none"
              : "cursor-grab select-none touch-none"),
        )}
      >
        <div className="flex justify-center pt-1.5">
          <div
            className="h-1 w-10 rounded-full bg-muted-foreground/50"
            aria-hidden="true"
          />
        </div>
        <div className="flex items-center justify-between gap-2 px-4 pt-1 pb-2">
          <div className="min-w-0 flex-1">
            {patient?._id ? (
              <Link
                to="/dashboard/gabinet/patients/$patientId"
                params={{ patientId: patient._id }}
                onClick={onClose}
                className="block truncate text-base font-semibold leading-tight hover:underline focus:underline focus:outline-none"
              >
                {patientFullName}
              </Link>
            ) : (
              <p className="truncate text-base font-semibold leading-tight">
                {patientFullName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label={t("gabinet.appointmentDetail.close", "Zamknij")}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {/* Secondary info — treatment, status, indicators, contact links */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {isMultiTreatment ? (
              <div className="flex flex-wrap gap-1">
                {junctionTreatments.map((jt) => {
                  const name =
                    treatments?.find((tr) => tr._id === jt.treatmentId)?.name ??
                    treatment?.name ??
                    t("gabinet.appointments.selectTreatment");
                  return (
                    <span
                      key={jt.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-sm font-medium text-foreground"
                    >
                      <Stethoscope className="size-3.5 shrink-0 text-primary" />
                      <span className="truncate">{name}</span>
                    </span>
                  );
                })}
              </div>
            ) : (
              <Popover
                open={treatmentOpen}
                onOpenChange={(o) => {
                  setTreatmentOpen(o);
                  if (!o) setTreatmentSearch("");
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-sm font-medium text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label={t("gabinet.appointments.selectTreatment")}
                  >
                    <Stethoscope className="size-3.5 shrink-0 text-primary" />
                    <span className="truncate">
                      {treatmentDisplayName
                        ? selectedVariantName
                          ? `${treatmentDisplayName} · ${selectedVariantName}`
                          : treatmentDisplayName
                        : t("gabinet.appointments.selectTreatment")}
                    </span>
                    <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-72 p-0"
                  align="start"
                  style={{
                    maxHeight: "var(--radix-popover-content-available-height)",
                  }}
                >
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder={t("gabinet.appointments.searchTreatment")}
                      value={treatmentSearch}
                      onValueChange={setTreatmentSearch}
                      onClose={() => setTreatmentOpen(false)}
                      closeLabel={t("common.close")}
                    />
                    <CommandList className="flex-1 min-h-0">
                      <CommandEmpty>{t("common.noResults")}</CommandEmpty>
                      <CommandGroup>
                        {filteredTreatments.map((tr) => (
                          <CommandItem
                            key={tr._id}
                            value={tr._id}
                            onSelect={() => {
                              setTreatmentId(tr._id);
                              setVariantId("");
                              setTreatmentOpen(false);
                              setTreatmentSearch("");
                            }}
                            className={cn(
                              "px-3",
                              treatmentId === tr._id &&
                                "bg-accent font-medium text-accent-foreground",
                            )}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm">{tr.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {tr.duration} min
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
            <Badge variant="outline" className="text-xs">
              <span
                className={`mr-1.5 inline-block h-2 w-2 rounded-full ${STATUS_DOT_COLORS[initialStatus] ?? "bg-muted-foreground"}`}
              />
              {t(`gabinet.appointments.statuses.${initialStatus}`)}
            </Badge>
            {previewIndicators.length > 0 && (
              <div className="flex items-center gap-0.5">
                {previewIndicators.map((ind, i) => (
                  <AppointmentIndicatorBadge
                    key={`preview-ind-${ind.kind}-${i}`}
                    indicator={ind}
                    ringClass="ring-black/10 dark:ring-white/20"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Variant selector — shown only when the selected treatment has variants */}
          {selectedTreatment && variants && variants.length > 0 && (
            <div className="flex items-center gap-2">
              <Select
                value={variantId}
                onValueChange={(v) => setVariantId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue
                    placeholder={t(
                      "gabinet.appointments.selectVariant",
                      "Wybierz wariant",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {t("gabinet.appointments.noVariant", "Bez wariantu")}
                  </SelectItem>
                  {variants.map((v) => (
                    <SelectItem key={v._id} value={v._id}>
                      <div className="flex flex-col">
                        <span>{v.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {v.resolvedDuration} min
                          {v.resolvedPrice != null
                            ? ` · ${formatCurrencyPLN(v.resolvedPrice)}`
                            : ""}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Quick contact links */}
          {patient && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {patient.phone ? (
                <a
                  href={`tel:${patient.phone}`}
                  className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Phone className="size-3" />
                  {formatPhoneNumber(patient.phone)}
                </a>
              ) : isEditingPhone ? (
                <div className="inline-flex items-center gap-1 rounded-md border px-1 py-0.5">
                  <Phone className="size-3 text-muted-foreground" />
                  <Input
                    type="tel"
                    autoFocus
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSavePhone();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setIsEditingPhone(false);
                        setPhoneInput("");
                      }
                    }}
                    placeholder={t("common.phone")}
                    className="h-5 w-28 border-0 px-1 py-0 text-xs focus-visible:ring-0"
                    disabled={savingPhone}
                  />
                  <button
                    type="button"
                    className="rounded p-0.5 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50 dark:hover:bg-emerald-900/30"
                    onClick={handleSavePhone}
                    disabled={savingPhone || !phoneInput.trim()}
                    aria-label={t("common.save")}
                  >
                    <Check className="size-3" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                    onClick={() => {
                      setIsEditingPhone(false);
                      setPhoneInput("");
                    }}
                    disabled={savingPhone}
                    aria-label={t("common.cancel")}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingPhone(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Plus className="size-3" />
                  {t("gabinet.appointmentDetail.addPhone")}
                </button>
              )}
              {patient.email && (
                <a
                  href={`mailto:${patient.email}`}
                  className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Mail className="size-3" />
                  {patient.email}
                </a>
              )}
            </div>
          )}
        </div>

        {warnings.length > 0 && (
          <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="size-3.5 shrink-0" />
              {t("gabinet.appointments.warnings.title", "Ostrzeżenie")}
            </div>
            <ul className="ml-5 list-disc space-y-0.5">
              {warnings.map((w) => (
                <li key={w}>{t(`gabinet.appointments.warnings.${w}`)}</li>
              ))}
            </ul>
          </div>
        )}

        <Separator />

        {/* Date summary */}
        <div className="flex flex-col gap-y-1 text-xs">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("gabinet.appointmentDetail.appointmentDateLabel", "Data wizyty")}
          </Label>
          <div className="flex items-center gap-1.5 text-foreground">
            <Calendar className="size-3.5 text-muted-foreground" />
            <span className="truncate text-sm">
              {formatDateLabel(appointment.date)}
            </span>
          </div>
        </div>

        <Separator />

        {/* Edit fields */}
        <div className="space-y-3">
          {/* On phones the popover is only ~360px wide so DATA + OD + DO in one
            row crams the date input into ~140px. Worse, iOS Safari renders
            `<input type="date">` taller than the Select-based TimePicker5Min,
            and the previous `items-end` aligned the bottoms so OD/DO labels
            ended up at a different vertical position than DATA — the "krzywo"
            (crooked) layout reported in #1824. Stack vertically below `sm` so
            the date gets a full-width row and OD/DO share the next row; on
            tablets and up restore the horizontal grid but with `items-start`
            so labels stay aligned even when input heights differ. */}
          <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[1fr_auto_auto] sm:items-start sm:gap-1.5">
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("common.date")}
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 w-full text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:contents">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t("common.from", "Od")}
                </Label>
                <TimePicker5Min
                  value={startTime}
                  onChange={handleStartTimeChange}
                  className="h-8 w-full text-sm sm:w-[88px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t("common.to", "Do")}
                </Label>
                <TimePicker5Min
                  value={endTime}
                  onChange={setEndTime}
                  className="h-8 w-full text-sm sm:w-[88px]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("gabinet.appointmentDetail.tagsLabel", {
                defaultValue: "Etykiety",
              })}
            </Label>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <div className="min-w-0 flex-1">
                <TagsPicker
                  tags={tagDefinitions}
                  selectedIds={tagIds}
                  onChange={setTagIds}
                  direction="horizontal"
                  size="sm"
                  placeholder={
                    tagDefinitions.length === 0
                      ? t("gabinet.appointmentDetail.addFirstTagHint", {
                          defaultValue: 'Dodaj pierwszy tag w "Zarządzaj"',
                        })
                      : t("gabinet.appointmentDetail.addTagsPlaceholder", {
                          defaultValue: "Dodaj etykietę",
                        })
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => dispatch("manageTags")}
                className="shrink-0 self-center text-[11px] font-medium text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                {t("gabinet.appointmentDetail.manageTags", {
                  defaultValue: "Zarządzaj",
                })}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("gabinet.appointments.notes")}
            </Label>
            <RichTextEditor
              value={notes}
              onChange={(v) => setNotes(v ?? "")}
              placeholder={t("gabinet.appointments.notesPlaceholder")}
              minHeight="80px"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("gabinet.appointments.internalNotes")}
            </Label>
            <RichTextEditor
              value={internalNotes}
              onChange={(v) => setInternalNotes(v ?? "")}
              placeholder={t("gabinet.appointments.internalNotesPlaceholder")}
              minHeight="104px"
            />
          </div>

          {/* Status change is demoted to the bottom of the edit block (issue
            #1825). On phones the popover is tall enough that staff scroll past
            DATE / TIME / TAGS / NOTES before reaching this, which matches the
            actual usage frequency — most edits to a freshly opened preview
            target the schedule and notes, not the status. The current status
            is still visible as a Badge near the top of the popover. */}
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("gabinet.appointmentDetail.changeStatus")}
            </Label>
            <TooltipProvider delayDuration={200}>
              <div
                role="radiogroup"
                aria-label={t("gabinet.appointmentDetail.changeStatus")}
                className="flex flex-wrap items-center gap-1"
              >
                {STATUS_ORDER.map((s) => {
                  const Icon = STATUS_ICONS[s];
                  const isCurrent = s === initialStatus;
                  const isAvailable =
                    !isCurrent && availableTransitions.includes(s);
                  const isDisabled =
                    !isCurrent && (!isAvailable || savingStatus);
                  const label = t(`gabinet.appointments.statuses.${s}`);
                  return (
                    <Tooltip key={s}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={isCurrent}
                          aria-label={label}
                          disabled={isDisabled}
                          onClick={() => {
                            if (!isAvailable) return;
                            handleStatusChange(s);
                          }}
                          className={cn(
                            // Bumped contrast so the icons read clearly on the
                            // dark popover surface (#1738): foreground text and
                            // a stronger border, plus the colour-coded active
                            // ring is unchanged.
                            "inline-flex size-9 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isCurrent && STATUS_ACTIVE_CLASSES[s],
                            isCurrent && "cursor-default",
                            isAvailable && STATUS_HOVER_CLASSES[s],
                            isAvailable && "cursor-pointer hover:bg-accent",
                            isDisabled &&
                              !isCurrent &&
                              "cursor-not-allowed opacity-40",
                          )}
                        >
                          <Icon className="size-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {label}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>

          {/* Appointment change history — issue #1837. Lazy-loaded on open so
            we don't fetch activities for every preview popover the user
            hovers over. Reschedule/status changes carry actor + timestamp
            from the backend logActivity call. */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setChangeHistoryOpen((v) => !v)}
              aria-expanded={changeHistoryOpen}
              className="flex w-full items-center justify-between rounded-md border bg-background px-2.5 py-2 text-left text-xs font-medium hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="inline-flex items-center gap-1.5">
                <History
                  className="size-3.5 text-muted-foreground"
                  variant="stroke"
                />
                {t(
                  "gabinet.appointmentDetail.changeHistory",
                  "Wszystkie zmiany terminów",
                )}
              </span>
              <ChevronDown
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  changeHistoryOpen && "rotate-180",
                )}
                variant="stroke"
              />
            </button>
            {changeHistoryOpen && (
              <div className="rounded-md border bg-muted/40 px-2.5 py-2">
                {(() => {
                  const entries = (appointmentActivities ?? []).filter(
                    (a) =>
                      a.action === "updated" ||
                      a.action === "status_changed" ||
                      a.action === "created",
                  );
                  if (entries.length === 0) {
                    return (
                      <p className="py-2 text-center text-[11px] text-muted-foreground">
                        {t(
                          "gabinet.appointmentDetail.changeHistoryEmpty",
                          "Brak zmian — od utworzenia nikt nie modyfikował tej wizyty.",
                        )}
                      </p>
                    );
                  }
                  return (
                    <ul className="space-y-1.5">
                      {entries.map((a) => {
                        const actor =
                          a.performedByName ??
                          t(
                            "gabinet.appointmentDetail.changeHistoryUnknownActor",
                            "Nieznany użytkownik",
                          );
                        const when = new Date(a.createdAt).toLocaleString(
                          i18n.language,
                          {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        );
                        // Prefer a localized rule match; fall back to a
                        // per-action label so unrecognised templates don't leak
                        // raw English (#1855); raw description is the last
                        // resort.
                        const label =
                          translateActivityDescription(a.description, t) ??
                          getActionFallbackLabel(a.action, t) ??
                          a.description;
                        return (
                          <li
                            key={a._id}
                            className="rounded-md bg-background px-2 py-1.5 text-[11px] leading-tight"
                          >
                            <p className="font-medium text-foreground">
                              {label}
                            </p>
                            <p className="mt-0.5 text-muted-foreground">
                              {actor} · {when}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {hasShortage && (
          <StockShortageWarning items={shortageItems} size="compact" />
        )}

        {/* Actions — unified Button size="sm" (h-9) so every clickable in the
          popover matches the same scale (issue #1738 follow-up: previously
          this row mixed h-8/h-9 and a TagsPicker md trigger). "Przeprowadź
          zabieg" stays full-width on its own row because it's a primary
          shortcut into a different surface. On phones the popover sits flush
          against the viewport edges so right-aligned buttons in a flex-wrap
          row could get clipped (issue #1823); stack vertically below `sm` so
          every action stays fully visible. */}
        <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="w-full sm:w-auto"
          >
            <Link
              to="/dashboard/gabinet/appointments/$appointmentId"
              params={{ appointmentId: appointment._id }}
            >
              <ExternalLink className="mr-1 size-3.5" />
              {isSettled
                ? t("gabinet.appointmentDetail.viewDetails", "Szczegóły wizyty")
                : t("gabinet.appointmentDetail.edit", "Edytuj")}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleSave()}
            disabled={!dirty || saving}
            className="w-full sm:w-auto"
          >
            {saving
              ? t("common.saving")
              : t("gabinet.appointmentDetail.saveChanges", "Zapisz zmiany")}
          </Button>
          <Button
            size="sm"
            variant={isSettled ? "outline" : "default"}
            onClick={() => setSettleDialogOpen(true)}
            disabled={saving || isSettled}
            className="w-full sm:w-auto"
          >
            {saving ? (
              t("common.saving")
            ) : isSettled ? (
              <>
                <CircleCheck className="mr-1 size-3.5" />
                {t("gabinet.appointmentDetail.settled", "Rozliczono")}
              </>
            ) : (
              t("gabinet.appointmentDetail.closeAndSettle", "Rozlicz wizytę")
            )}
          </Button>
        </div>

        {/* Perform treatment shortcut — issue #1629. Sends staff straight to the
          Dokumentacja tab where they can attach before/after photos, fill the
          treatment card, and complete the per-appointment paperwork. */}
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link
            to="/dashboard/gabinet/appointments/$appointmentId"
            params={{ appointmentId: appointment._id }}
            search={{ tab: "documentation" }}
            onClick={onClose}
          >
            <Sparkles className="mr-1.5 size-3.5" />
            {t(
              "gabinet.appointmentDetail.performTreatment",
              "Przeprowadź wizytę",
            )}
          </Link>
        </Button>
      </div>

      <Dialog
        open={cancelDialogOpen}
        onOpenChange={(o) => {
          setCancelDialogOpen(o);
          if (!o) setCancelReason("");
        }}
      >
        <DialogContent
          ref={cancelDrag.contentRef}
          onPointerDown={cancelDrag.onPointerDown}
          className={cn(
            "sm:max-w-md",
            cancelDrag.isDragging && "cursor-grabbing select-none",
          )}
        >
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
              onClick={() => {
                setCancelDialogOpen(false);
                setCancelReason("");
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelConfirm}
              disabled={savingStatus}
            >
              {savingStatus
                ? t("common.processing")
                : t("gabinet.appointments.actions.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocumentGateDialog
        open={gateDialogOpen}
        onOpenChange={setGateDialogOpen}
        appointmentId={appointmentId}
        organizationId={organizationId}
        timing={gateTiming}
        targetStatus={gateTargetStatus}
        onProceed={() => performStatusChange(gateTargetStatus)}
        onFillDocument={() => setGateDialogOpen(false)}
      />

      <Dialog open={settleDialogOpen} onOpenChange={setSettleDialogOpen}>
        <DialogContent
          ref={settleDrag.contentRef}
          onPointerDown={settleDrag.onPointerDown}
          className={cn(
            "sm:max-w-2xl",
            settleDrag.isDragging && "cursor-grabbing select-none",
          )}
        >
          <DialogHeader>
            <DialogTitle>
              {t("gabinet.appointmentDetail.closeAndSettle", "Rozlicz wizytę")}
            </DialogTitle>
            <DialogDescription>
              {t("gabinet.appointmentDetail.settleDesc", {
                defaultValue:
                  "Zarejestruj płatność i opcjonalnie zamknij wizytę jako zakończoną.",
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1 mt-2">
            {(isMultiTreatment
              ? junctionTreatments
              : treatment
                ? [treatment]
                : []
            ).map((item, i) => {
              const name = isMultiTreatment
                ? (treatments?.find(
                    (tr) =>
                      tr._id ===
                      (item as (typeof junctionTreatments)[0]).treatmentId,
                  )?.name ?? t("gabinet.appointments.selectTreatment"))
                : ((item as typeof treatment)?.name ?? "");
              return (
                <div key={i} className="flex justify-between gap-3">
                  <span className="text-muted-foreground truncate">{name}</span>
                </div>
              );
            })}
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                {t("gabinet.payments.treatmentPrice")}
              </span>
              <span className="font-medium tabular-nums">
                {formatCurrencyPLN(treatmentPrice)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                {t("gabinet.payments.totalPaid")}
              </span>
              <span className="font-medium tabular-nums">
                {formatCurrencyPLN(totalPaid)}
              </span>
            </div>
            <div className="flex justify-between gap-3 border-t pt-1">
              <span className="text-muted-foreground">
                {t("gabinet.payments.outstanding")}
              </span>
              <span className="font-semibold tabular-nums">
                {formatCurrencyPLN(outstanding)}
              </span>
            </div>
            {patientCreditBalance > 0 && (
              <div className="flex justify-between gap-3 border-t pt-1 text-emerald-700 dark:text-emerald-400">
                <span>
                  {t("gabinet.payments.creditBalance", {
                    defaultValue: "Saldo nadpłat",
                  })}
                </span>
                <span className="font-medium tabular-nums">
                  {formatCurrencyPLN(patientCreditBalance)}
                </span>
              </div>
            )}
          </div>

          {settleDialogOpen && (
            <SettlementForm
              organizationId={organizationId}
              appointmentId={appointment._id}
              patientId={patient?._id ?? ""}
              junctionTreatments={junctionTreatments}
              legacyTreatmentPrice={treatment?.price}
              treatmentsList={treatments}
              payments={
                (detail.payments ?? []) as Array<Record<string, unknown>>
              }
              patientPackageUsage={packageUsageForSettle}
              linkedPackageUsageId={appointment.packageUsageId ?? null}
              showMarkCompleted={canMarkCompleted}
              onMarkCompleted={async () => {
                const result = await updateStatus({
                  organizationId,
                  appointmentId: appointment._id,
                  status: "completed",
                });
                if (result?.warnings?.length) {
                  toast.warning(t("gabinet.stock.negativeWarning"));
                }
              }}
              onBeforeSubmit={
                dirty
                  ? async () => {
                      await handleSave(false);
                    }
                  : undefined
              }
              onSuccess={async () => {
                await Promise.all([
                  queryClient.invalidateQueries({
                    queryKey: supabaseKeys.gabinetAppointments.all,
                  }),
                  queryClient.invalidateQueries({
                    queryKey: supabaseKeys.scheduledActivities.all,
                  }),
                  queryClient.invalidateQueries({
                    queryKey: supabaseKeys.payments.all,
                  }),
                  queryClient.invalidateQueries({
                    queryKey: [
                      "gabinet.packages.getPatientPackagesEnriched",
                      organizationId,
                      patientIdForPackages,
                    ],
                  }),
                  queryClient.invalidateQueries({
                    queryKey: [
                      "gabinet.packages.getPatientPackages",
                      organizationId,
                      patientIdForPackages,
                    ],
                  }),
                ]);
                await refetch();
                setSettleDialogOpen(false);
                onClose();
              }}
              onCancel={() => setSettleDialogOpen(false)}
              extraFooterContent={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleNavigateToPayments}
                >
                  <ExternalLink className="mr-1 size-3" />
                  {t("gabinet.payments.paymentHistory")}
                </Button>
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
