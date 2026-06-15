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
  extractActionErrorMessage,
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { ChangeEmployeeModal } from "@/components/gabinet/change-employee-modal";
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
import {
  BadgeCheck,
  Calendar,
  CircleCheck,
  Clock,
  Mail,
  OctagonX,
  Phone,
  PlayCircle,
  Sparkles,
  Stethoscope,
  User,
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
  pending_confirmation: "hover:border-amber-300 hover:text-amber-700 dark:hover:text-amber-300",
  scheduled: "hover:border-blue-300 hover:text-blue-700 dark:hover:text-blue-300",
  confirmed: "hover:border-emerald-300 hover:text-emerald-700 dark:hover:text-emerald-300",
  in_progress: "hover:border-yellow-300 hover:text-yellow-700 dark:hover:text-yellow-300",
  completed: "hover:border-gray-300 hover:text-gray-700 dark:hover:text-gray-300",
  cancelled: "hover:border-red-300 hover:text-red-700 dark:hover:text-red-300",
  no_show: "hover:border-orange-300 hover:text-orange-700 dark:hover:text-orange-300",
};

interface AppointmentPreviewContentProps {
  appointmentId: string;
  onClose: () => void;
}

export function AppointmentPreviewContent({
  appointmentId,
  onClose,
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
  const createPaymentAction = useAction(api.payments.create);
  const getPatientPackagesEnriched = useAction(
    api.gabinet.packages.getPatientPackagesEnriched,
  );
  const usePackageTreatmentsBatch = useAction(
    api.gabinet.packages.usePackageTreatmentsBatch,
  );

  const { data: detail, isLoading, refetch } = useQuery({
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
  }) as { data: Array<{ _id: string; name: string; duration: number }> | undefined };

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

  const snapTimeTo5Min = (value: string): string => {
    if (!value) return value;
    const [h, m] = value.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
    const total = Math.min(Math.max(h * 60 + m, 0), 24 * 60 - 1);
    const snapped = Math.min(Math.round(total / 5) * 5, 24 * 60 - 1);
    return `${String(Math.floor(snapped / 60)).padStart(2, "0")}:${String(snapped % 60).padStart(2, "0")}`;
  };

  const handleStartTimeChange = (rawStart: string) => {
    const newStart = snapTimeTo5Min(rawStart);
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
  const [internalNotes, setInternalNotes] = useState("");
  const [treatmentId, setTreatmentId] = useState("");
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
  const [changeEmployeeOpen, setChangeEmployeeOpen] = useState(false);

  const [settleDialogOpen, setSettleDialogOpen] = useState(false);
  // Drag-to-reposition for the sub-dialogs that open from the preview popover
  // (issue #1548). Same drag-from-anywhere behaviour as the appointment dialog
  // and preview popover (#1459, #1476) — users want to peek at what's behind
  // these modal confirmations without dismissing them first.
  const cancelDrag = useDraggableDialog(cancelDialogOpen);
  const settleDrag = useDraggableDialog(settleDialogOpen);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleMethod, setSettleMethod] = useState<
    "cash" | "card" | "transfer" | "package" | "other"
  >("cash");
  const [settleNotes, setSettleNotes] = useState("");
  const [settleMarkCompleted, setSettleMarkCompleted] = useState(true);
  const [settleSubmitting, setSettleSubmitting] = useState(false);
  const [settleSplitPayment, setSettleSplitPayment] = useState(false);
  const [settleFirstSplitMethod, setSettleFirstSplitMethod] = useState<
    "cash" | "card" | "transfer" | "package" | "other"
  >("cash");
  const [settleSecondSplitMethod, setSettleSecondSplitMethod] = useState<
    "cash" | "card" | "transfer" | "package" | "other"
  >("card");
  const [settleFirstSplitAmount, setSettleFirstSplitAmount] = useState("");
  const [settleSecondSplitAmount, setSettleSecondSplitAmount] = useState("");
  // Patient credit (overpayment carry-forward) — issue #1059.
  const [settleUseCredit, setSettleUseCredit] = useState(false);
  const [settleCreditAmount, setSettleCreditAmount] = useState("");
  // Deduct units from an active package covering this visit's treatment
  // (issue #1697). Staff opens "Rozlicz wizytę" and chooses how many "sztuki"
  // of the package to draw down — defaults to 1 when a single matching
  // package exists, otherwise the picker stays empty until staff selects one.
  const [settleUsePackage, setSettleUsePackage] = useState(false);
  const [settlePackageUsageId, setSettlePackageUsageId] = useState<string>("");
  const [settlePackageQuantity, setSettlePackageQuantity] = useState<number>(1);

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
    setInternalNotes(appt.internalNotes ?? "");
    setTreatmentId(appt.treatmentId ? String(appt.treatmentId) : "");
    setTagIds(
      (appt.tagIds ?? []).map((id) => id as Id<"tagDefinitions">),
    );
  }, [detail, appointmentId]);

  if (isLoading || !detail) {
    return (
      <div className="space-y-3 p-1">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const { appointment, patient, treatment, employee } = detail;
  const initialStatus = appointment.status as AppointmentStatus;
  const initialTreatmentId = appointment.treatmentId
    ? String(appointment.treatmentId)
    : "";
  const availableTransitions = VALID_TRANSITIONS[initialStatus] ?? [];
  const employeeName = employee?.name ?? employee?.email ?? "-";
  const patientFullName = patient
    ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim()
    : "-";

  const selectedTreatment =
    treatments?.find((tr) => tr._id === treatmentId) ?? null;
  const treatmentDisplayName =
    selectedTreatment?.name ?? treatment?.name ?? "";
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
    internalNotes !== (appointment.internalNotes ?? "") ||
    treatmentId !== initialTreatmentId ||
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
      toast.error(extractActionErrorMessage(error) || t("common.error"));
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
      await updateStatus({
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

  const handleSave = async () => {
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
        if (internalNotes !== (appointment.internalNotes ?? ""))
          args.internalNotes = internalNotes || null;
        if (treatmentId && treatmentId !== initialTreatmentId)
          args.treatmentId = treatmentId;
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
      onClose();
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

  const treatmentPrice = treatment?.price ?? 0;
  const totalPaid = (detail.payments ?? [])
    .filter(
      (p) => p.status === "completed" || p.status === "pending",
    )
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const outstanding = Math.max(0, treatmentPrice - totalPaid);
  const canMarkCompleted = availableTransitions.includes("completed");

  // Completed-only total drives the visible paid/partial/unpaid pill in the
  // indicator row — pending payments are auto-created when an appointment is
  // booked, so they mustn't count as actually paid. Issue #1031.
  const completedPaid = (detail.payments ?? [])
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);

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
        title: t(
          "gabinet.calendar.indicators.firstVisit",
          "Pierwsza wizyta",
        ),
      });
    }

    if (appointment.prepaymentRequired && appointment.prepaymentStatus !== "paid") {
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

    if (patientCreditBalance > 0 && status !== "cancelled" && status !== "no_show") {
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
          title: t(
            "gabinet.calendar.indicators.partial",
            "Częściowo opłacona",
          ),
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

  // Active package usages that still have remaining sessions for THIS visit's
  // treatment. Drives the new "Pakiet aktywny" section in the settle dialog
  // (issue #1697). Skip when the appointment already has a linked
  // `packageUsageId` — that path auto-deducts 1 on completion via
  // `handleAppointmentCompletion`, so showing the picker would double-deduct.
  const eligiblePackageUsages =
    appointment.packageUsageId || !appointment.treatmentId
      ? []
      : (patientPackagesEnriched ?? []).filter((u) => {
          if (u.status !== "active") return false;
          if (u.expiresAt && (u.expiresAt as number) < Date.now()) return false;
          const entry = u.treatmentsUsed.find(
            (tu) => tu.treatmentId === String(appointment.treatmentId),
          );
          return !!entry && entry.usedCount < entry.totalCount;
        });

  const selectedPackageUsage = eligiblePackageUsages.find(
    (u) => u._id === settlePackageUsageId,
  );
  const selectedPackageEntry = selectedPackageUsage?.treatmentsUsed.find(
    (tu) => tu.treatmentId === String(appointment.treatmentId),
  );
  const selectedPackageRemaining = selectedPackageEntry
    ? selectedPackageEntry.totalCount - selectedPackageEntry.usedCount
    : 0;
  const packageQuantityExceedsRemaining =
    settleUsePackage &&
    !!selectedPackageEntry &&
    settlePackageQuantity > selectedPackageRemaining;

  const handleOpenSettleDialog = () => {
    if (saving || settleSubmitting) return;
    setSettleAmount(outstanding > 0 ? outstanding.toFixed(2) : "");
    setSettleMethod("cash");
    setSettleNotes("");
    setSettleMarkCompleted(canMarkCompleted);
    setSettleSplitPayment(false);
    setSettleFirstSplitMethod("cash");
    setSettleSecondSplitMethod("card");
    setSettleFirstSplitAmount("");
    setSettleSecondSplitAmount("");
    setSettleUseCredit(false);
    setSettleCreditAmount(
      Math.min(patientCreditBalance, outstanding).toFixed(2),
    );
    // Pre-arm the package-deduction section when exactly one matching package
    // is available — the common case is a single active package, so staff get
    // a one-click "rozlicz z pakietu" affordance without juggling a picker.
    // With 0 or 2+ packages, leave the toggle off and let staff decide.
    const singlePkg = eligiblePackageUsages.length === 1;
    setSettleUsePackage(singlePkg);
    setSettlePackageUsageId(singlePkg ? eligiblePackageUsages[0]._id : "");
    setSettlePackageQuantity(1);
    setSettleDialogOpen(true);
  };

  // Credit applied + overpayment derivation. Credit can stack with split
  // payment (issue #1288): credit reduces outstanding first, the two split
  // amounts cover the remainder.
  const parsedSettleAmount =
    parseFloat(settleAmount.replace(",", ".")) || 0;
  const parsedCreditAmount =
    parseFloat(settleCreditAmount.replace(",", ".")) || 0;
  const creditMaxApplicable = Math.min(patientCreditBalance, outstanding);
  const creditApplied =
    settleUseCredit && parsedCreditAmount > 0
      ? Math.min(parsedCreditAmount, creditMaxApplicable)
      : 0;
  const creditApplyExceedsBalance =
    settleUseCredit && parsedCreditAmount > patientCreditBalance + 0.005;

  const parsedFirstSplitAmount =
    parseFloat(settleFirstSplitAmount.replace(",", ".")) || 0;
  const parsedSecondSplitAmount =
    parseFloat(settleSecondSplitAmount.replace(",", ".")) || 0;
  const splitTotal =
    Math.round((parsedFirstSplitAmount + parsedSecondSplitAmount) * 100) / 100;
  // Credit reduces what the two methods need to cover.
  const splitExpectedTotal =
    Math.round(Math.max(0, outstanding - creditApplied) * 100) / 100;
  const splitMismatch =
    settleSplitPayment && splitTotal !== splitExpectedTotal;
  // When credit covers the entire visit, no split amounts are required —
  // the visit will be settled by a credit-only payment row.
  const splitMissingAmount =
    settleSplitPayment &&
    splitExpectedTotal > 0 &&
    parsedFirstSplitAmount <= 0 &&
    parsedSecondSplitAmount <= 0;
  // Methods only need to differ when both split rows are actually used.
  const splitSameMethod =
    settleSplitPayment &&
    parsedFirstSplitAmount > 0 &&
    parsedSecondSplitAmount > 0 &&
    settleFirstSplitMethod === settleSecondSplitMethod;

  const overpaymentAmount = !settleSplitPayment
    ? Math.max(0, parsedSettleAmount + creditApplied - outstanding)
    : 0;

  const handleConfirmSettle = async () => {
    if (settleSubmitting) return;
    const parsedAmount = parseFloat(settleAmount.replace(",", "."));
    const hasAmount = settleAmount.trim().length > 0 && !isNaN(parsedAmount);
    if (creditApplyExceedsBalance) {
      toast.error(
        t("gabinet.payments.creditExceedsBalance", {
          defaultValue:
            "Kwota użytego salda nadpłat przekracza dostępne środki.",
        }),
      );
      return;
    }
    if (settleUsePackage) {
      if (!settlePackageUsageId) {
        toast.error(
          t("gabinet.appointmentDetail.packageNotSelected", {
            defaultValue: "Wybierz pakiet, z którego chcesz zdjąć sztuki.",
          }),
        );
        return;
      }
      if (settlePackageQuantity < 1) {
        toast.error(
          t("gabinet.appointmentDetail.packageQuantityMin", {
            defaultValue: "Liczba sztuk musi wynosić co najmniej 1.",
          }),
        );
        return;
      }
      if (packageQuantityExceedsRemaining) {
        toast.error(
          t("gabinet.appointmentDetail.packageQuantityExceeds", {
            defaultValue:
              "Liczba sztuk przekracza pozostałą ilość w pakiecie.",
          }),
        );
        return;
      }
    }
    if (settleSplitPayment) {
      if (splitMissingAmount) {
        toast.error(
          t(
            "gabinet.packages.splitMissingAmount",
            "Podaj kwotę co najmniej jednej metody płatności",
          ),
        );
        return;
      }
      if (splitMismatch) {
        toast.error(
          t(
            "gabinet.packages.splitMismatchError",
            "Suma rozdzielonych płatności musi być równa cenie",
          ),
        );
        return;
      }
      if (splitSameMethod) {
        toast.error(
          t(
            "gabinet.packages.splitSameMethodError",
            "Wybierz dwie różne metody płatności",
          ),
        );
        return;
      }
    } else {
      if (hasAmount && parsedAmount < 0) {
        toast.error(t("gabinet.payments.amountRequired"));
        return;
      }
      if (
        !hasAmount &&
        creditApplied <= 0 &&
        !settleMarkCompleted &&
        !settleUsePackage
      ) {
        toast.error(
          t("gabinet.appointmentDetail.settleNothingToDo", {
            defaultValue: "Wpisz kwotę lub zaznacz zamknięcie wizyty.",
          }),
        );
        return;
      }
    }
    setSettleSubmitting(true);
    try {
      if (dirty) {
        await handleSave();
      }
      // Issue #1697: deduct chosen number of "sztuki" from the active package
      // before recording the payment row, so the visible package progress is
      // up-to-date by the time the dialog closes and the calendar refreshes.
      if (
        settleUsePackage &&
        settlePackageUsageId &&
        settlePackageQuantity > 0 &&
        appointment.treatmentId
      ) {
        await usePackageTreatmentsBatch({
          organizationId,
          usageId: settlePackageUsageId,
          items: [
            {
              treatmentId: String(appointment.treatmentId),
              quantity: settlePackageQuantity,
            },
          ],
          appointmentId: appointment._id,
        });
      }
      if (settleSplitPayment && patient?._id) {
        const parts: Array<{
          method: "cash" | "card" | "transfer" | "package" | "other";
          amount: number;
        }> = [];
        if (parsedFirstSplitAmount > 0)
          parts.push({
            method: settleFirstSplitMethod,
            amount: parsedFirstSplitAmount,
          });
        if (parsedSecondSplitAmount > 0)
          parts.push({
            method: settleSecondSplitMethod,
            amount: parsedSecondSplitAmount,
          });
        if (parts.length === 0 && creditApplied > 0) {
          // Credit covers the whole visit: record a credit-only ledger row
          // so the visit is settled without a cash/card payment.
          await createPaymentAction({
            organizationId,
            patientId: patient._id,
            appointmentId: appointment._id,
            amount: 0,
            currency: "PLN",
            paymentMethod: settleFirstSplitMethod,
            notes: settleNotes.trim() || undefined,
            creditApplied,
          });
        } else {
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const baseNote = settleNotes.trim();
            const splitNote = `split: ${part.method}`;
            const combinedNote = baseNote
              ? `${baseNote} (${splitNote})`
              : splitNote;
            await createPaymentAction({
              organizationId,
              patientId: patient._id,
              appointmentId: appointment._id,
              amount: part.amount,
              currency: "PLN",
              paymentMethod: part.method,
              notes: combinedNote,
              // Attach credit to the first positive split row only — the
              // backend ledger entry on that row drains the patient's
              // balance for the whole settle action.
              ...(i === 0 && creditApplied > 0 ? { creditApplied } : {}),
            });
          }
        }
      } else if (
        patient?._id &&
        ((hasAmount && parsedAmount > 0) || creditApplied > 0)
      ) {
        await createPaymentAction({
          organizationId,
          patientId: patient._id,
          appointmentId: appointment._id,
          amount: parsedAmount > 0 ? parsedAmount : 0,
          currency: "PLN",
          paymentMethod: settleMethod,
          notes: settleNotes.trim() || undefined,
          ...(overpaymentAmount > 0
            ? { creditEarned: overpaymentAmount }
            : {}),
          ...(creditApplied > 0 ? { creditApplied } : {}),
        });
      } else if (
        // Issue #1697: package-only settle — staff drew sessions from a
        // package and did not enter a cash amount. Record a package-method
        // payment for the outstanding total so the visit clears the unpaid
        // indicator, mirroring the auto-deduction path that runs for
        // appointments already linked via `packageUsageId` (#1524).
        settleUsePackage &&
        settlePackageUsageId &&
        patient?._id &&
        outstanding > 0 &&
        !settleSplitPayment
      ) {
        await createPaymentAction({
          organizationId,
          patientId: patient._id,
          appointmentId: appointment._id,
          packageUsageId: settlePackageUsageId,
          amount: outstanding,
          currency: "PLN",
          paymentMethod: "package",
          notes: settleNotes.trim() || undefined,
        });
      }
      if (settleMarkCompleted && canMarkCompleted) {
        await updateStatus({
          organizationId,
          appointmentId: appointment._id,
          status: "completed",
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: supabaseKeys.gabinetAppointments.all,
        }),
        queryClient.invalidateQueries({
          queryKey: supabaseKeys.scheduledActivities.all,
        }),
        // Refresh the per-tile paid/unpaid indicator on the calendar
        // (issue #1040) after a settle action records a new payment.
        queryClient.invalidateQueries({
          queryKey: supabaseKeys.payments.all,
        }),
        // Issue #1697: refresh patient package usage so the settle dialog
        // (and any other open package widgets) reflect the deducted units.
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
      toast.success(
        t("gabinet.appointmentDetail.settleSuccess", {
          defaultValue: "Wizyta rozliczona",
        }),
      );
      onClose();
    } catch (error) {
      console.error("[appointment-preview] settle failed", error);
      toast.error(
        formatAppointmentError(error, t, {
          key: "gabinet.appointments.updateFailed",
          defaultValue: "Nie udało się rozliczyć wizyty.",
        }),
      );
    } finally {
      setSettleSubmitting(false);
    }
  };

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
    <div className="space-y-4">
      {/* Header — patient + treatment */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {patient?._id ? (
              <Link
                to="/dashboard/gabinet/patients/$patientId"
                params={{ patientId: patient._id }}
                onClick={onClose}
                className="block truncate text-sm font-semibold leading-tight hover:underline focus:underline focus:outline-none"
              >
                {patientFullName}
              </Link>
            ) : (
              <p className="truncate text-sm font-semibold leading-tight">
                {patientFullName}
              </p>
            )}
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
                  className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded text-sm font-medium text-foreground hover:text-primary focus:outline-none focus:ring-1 focus:ring-ring"
                  aria-label={t("gabinet.appointments.selectTreatment")}
                >
                  <Stethoscope className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate">
                    {treatmentDisplayName ||
                      t("gabinet.appointments.selectTreatment")}
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
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
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
            <Badge variant="outline" className="text-xs">
              <span
                className={`mr-1.5 inline-block h-2 w-2 rounded-full ${STATUS_DOT_COLORS[initialStatus] ?? "bg-muted-foreground"}`}
              />
              {t(`gabinet.appointments.statuses.${initialStatus}`)}
            </Badge>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label={t("gabinet.appointmentDetail.close", "Zamknij")}
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

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
        <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          <div className="flex items-center gap-1.5 font-medium">
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

      {/* Employee + Date summary */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {appointment.treatmentId ? (
          <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <User className="size-3 shrink-0" />
            <span className="truncate">{employeeName}</span>
            <button
              type="button"
              onClick={() => setChangeEmployeeOpen(true)}
              className="shrink-0 rounded text-[10px] font-medium text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t(
                "gabinet.appointments.changeEmployee",
                "Zmień pracownika",
              )}
            >
              {t("common.change", "Zmień")}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="size-3" />
            <span className="truncate">{employeeName}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="size-3" />
          <span className="truncate">{formatDateLabel(appointment.date)}</span>
        </div>
      </div>

      <Separator />

      {/* Edit fields */}
      <div className="space-y-3">
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
                          "inline-flex size-8 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isCurrent && STATUS_ACTIVE_CLASSES[s],
                          isCurrent && "cursor-default",
                          isAvailable && STATUS_HOVER_CLASSES[s],
                          isAvailable && "cursor-pointer hover:bg-accent",
                          isDisabled && !isCurrent && "cursor-not-allowed opacity-40",
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

        <div className="grid grid-cols-[1fr_auto_auto] items-end gap-1.5">
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("common.date")}
            </Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("common.from", "Od")}
            </Label>
            <Input
              type="time"
              step={300}
              value={startTime}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              className="h-8 w-[88px] text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("common.to", "Do")}
            </Label>
            <Input
              type="time"
              step={300}
              value={endTime}
              onChange={(e) => setEndTime(snapTimeTo5Min(e.target.value))}
              className="h-8 w-[88px] text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <div className="min-w-0 flex-1">
            <TagsPicker
              tags={tagDefinitions}
              selectedIds={tagIds}
              onChange={setTagIds}
              direction="horizontal"
              size="md"
              placeholder={
                tagDefinitions.length === 0
                  ? t("gabinet.appointmentDetail.addFirstTagHint", {
                      defaultValue: 'Dodaj pierwszy tag w "Zarządzaj"',
                    })
                  : t("gabinet.appointmentDetail.addTagsPlaceholder", {
                      defaultValue: "Etykiety",
                    })
              }
            />
          </div>
          <button
            type="button"
            onClick={() => dispatch("manageTags")}
            className="shrink-0 self-center text-[10px] font-medium text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {t("gabinet.appointmentDetail.manageTags", {
              defaultValue: "Zarządzaj",
            })}
          </button>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("gabinet.appointments.internalNotes")}
          </Label>
          <Textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            placeholder={t("gabinet.appointments.internalNotesPlaceholder")}
            className="min-h-[104px] text-sm"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
        >
          <Link
            to="/dashboard/gabinet/appointments/$appointmentId"
            params={{ appointmentId: appointment._id }}
          >
            <ExternalLink className="mr-1 size-3" />
            {t("gabinet.appointmentDetail.edit", "Edytuj")}
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={handleSave}
          disabled={!dirty || saving || settleSubmitting}
        >
          {saving
            ? t("common.saving")
            : t("gabinet.appointmentDetail.saveChanges", "Zapisz zmiany")}
        </Button>
        <Button
          size="sm"
          variant={isSettled ? "outline" : "default"}
          className="h-8 text-xs"
          onClick={handleOpenSettleDialog}
          disabled={saving || settleSubmitting || isSettled}
        >
          {saving ? (
            t("common.saving")
          ) : isSettled ? (
            <>
              <CircleCheck className="mr-1 size-3" />
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
      <Button
        asChild
        size="sm"
        variant="outline"
        className="h-9 w-full text-xs"
      >
        <Link
          to="/dashboard/gabinet/appointments/$appointmentId"
          params={{ appointmentId: appointment._id }}
          search={{ tab: "documentation" }}
          onClick={onClose}
        >
          <Sparkles className="mr-1.5 size-3.5" />
          {t("gabinet.appointmentDetail.performTreatment", "Przeprowadź zabieg")}
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
      timing="before_start"
      targetStatus="in_progress"
      onProceed={() => performStatusChange("in_progress")}
      onFillDocument={() => setGateDialogOpen(false)}
    />

    {appointment.treatmentId && (
      <ChangeEmployeeModal
        open={changeEmployeeOpen}
        onOpenChange={(o) => {
          setChangeEmployeeOpen(o);
          if (!o) void refetch();
        }}
        organizationId={organizationId}
        appointmentId={appointment._id as Id<"gabinetAppointments">}
        treatmentId={appointment.treatmentId as Id<"gabinetTreatments">}
        currentEmployeeId={appointment.employeeId as Id<"users">}
        appointmentDate={appointment.date}
        startTime={appointment.startTime.slice(0, 5)}
        endTime={appointment.endTime.slice(0, 5)}
        durationMinutes={treatment?.duration ?? 30}
      />
    )}

    <Dialog
      open={settleDialogOpen}
      onOpenChange={(o) => {
        if (settleSubmitting) return;
        setSettleDialogOpen(o);
      }}
    >
      <DialogContent
        ref={settleDrag.contentRef}
        onPointerDown={settleDrag.onPointerDown}
        className={cn(
          "sm:max-w-md",
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

        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
            {treatment?.name && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  {t("gabinet.appointments.treatment")}
                </span>
                <span className="font-medium truncate">{treatment.name}</span>
              </div>
            )}
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

          {eligiblePackageUsages.length > 0 && (
            <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 dark:border-blue-900 dark:bg-blue-950/30">
              <Label
                htmlFor="settle-use-package"
                className="-mx-1 flex min-h-11 select-none items-start gap-3 rounded-md px-1 py-1.5 cursor-pointer text-sm font-normal leading-snug active:bg-blue-100 dark:active:bg-blue-900/40"
              >
                <Checkbox
                  id="settle-use-package"
                  checked={settleUsePackage}
                  onCheckedChange={(v) => {
                    const next = v === true;
                    setSettleUsePackage(next);
                    if (next && !settlePackageUsageId) {
                      setSettlePackageUsageId(eligiblePackageUsages[0]._id);
                    }
                    // Issue #1793: client already paid for the package, so the
                    // visit should settle without an additional cash/card row.
                    // Clearing the amount sends `handleConfirmSettle` down the
                    // package-only path (writes a `paymentMethod: "package"`
                    // ledger entry for the outstanding total). Unchecking
                    // restores the cash flow.
                    if (next) {
                      setSettleAmount("");
                    } else {
                      setSettleAmount(
                        outstanding > 0 ? outstanding.toFixed(2) : "",
                      );
                    }
                  }}
                  className="mt-0.5"
                />
                <span>
                  {t("gabinet.appointmentDetail.deductFromPackage", {
                    defaultValue:
                      "Zdejmij sztuki z aktywnego pakietu pacjenta",
                  })}
                </span>
              </Label>
              {settleUsePackage && (
                <>
                  {eligiblePackageUsages.length > 1 && (
                    <div className="space-y-1">
                      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {t("gabinet.appointmentDetail.choosePackage", {
                          defaultValue: "Wybierz pakiet",
                        })}
                      </Label>
                      <Select
                        value={settlePackageUsageId}
                        onValueChange={(v) => setSettlePackageUsageId(v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue
                            placeholder={t(
                              "gabinet.appointmentDetail.choosePackage",
                              { defaultValue: "Wybierz pakiet" },
                            )}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {eligiblePackageUsages.map((u) => {
                            const entry = u.treatmentsUsed.find(
                              (tu) =>
                                tu.treatmentId ===
                                String(appointment.treatmentId),
                            );
                            const remaining = entry
                              ? entry.totalCount - entry.usedCount
                              : 0;
                            const total = entry?.totalCount ?? 0;
                            const pkgLabel =
                              u.packageName ?? t("gabinet.packages.package");
                            return (
                              <SelectItem key={u._id} value={u._id}>
                                {`${pkgLabel} — ${remaining}/${total}`}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {selectedPackageUsage && (
                    <div className="text-[11px] text-muted-foreground">
                      {t("gabinet.appointmentDetail.packageRemaining", {
                        defaultValue:
                          "{{name}} — pozostało {{remaining}} z {{total}}",
                        name:
                          selectedPackageUsage.packageName ??
                          t("gabinet.packages.package"),
                        remaining: selectedPackageRemaining,
                        total: selectedPackageEntry?.totalCount ?? 0,
                      })}
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {t("gabinet.appointmentDetail.unitsToDeduct", {
                        defaultValue: "Ile sztuk zdjąć?",
                      })}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={
                        selectedPackageEntry
                          ? selectedPackageRemaining
                          : undefined
                      }
                      value={settlePackageQuantity}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (Number.isFinite(v) && v >= 1) {
                          setSettlePackageQuantity(v);
                        } else if (e.target.value === "") {
                          setSettlePackageQuantity(1);
                        }
                      }}
                    />
                    {packageQuantityExceedsRemaining && (
                      <p className="text-[11px] text-destructive">
                        {t(
                          "gabinet.appointmentDetail.packageQuantityExceeds",
                          {
                            defaultValue:
                              "Liczba sztuk przekracza pozostałą ilość w pakiecie.",
                          },
                        )}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {!settleSplitPayment && !settleUsePackage && (
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("gabinet.payments.amount")}
              </Label>
              <Input
                type="text"
                inputMode="decimal"
                value={settleAmount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                    setSettleAmount(v);
                  }
                }}
                placeholder={outstanding > 0 ? outstanding.toFixed(2) : "0.00"}
                disabled={!patient?._id}
              />
              {!patient?._id && (
                <p className="text-[11px] text-muted-foreground">
                  {t("gabinet.payments.noPaymentsDesc")}
                </p>
              )}
            </div>
          )}

          {!settleSplitPayment && !settleUsePackage && (
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("gabinet.payments.method")}
              </Label>
              <Select
                value={settleMethod}
                onValueChange={(v) =>
                  setSettleMethod(v as typeof settleMethod)
                }
              >
                <SelectTrigger className="h-9">
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
                  <SelectItem value="package">
                    {t("gabinet.payments.methods.package")}
                  </SelectItem>
                  <SelectItem value="other">
                    {t("gabinet.payments.methods.other")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {settleUsePackage && !settleSplitPayment && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
              {t("gabinet.payments.packageCoversVisitNote", {
                defaultValue:
                  "Wizyta zostanie rozliczona z pakietu — klient już opłacił pakiet, nie wymaga dodatkowej formy płatności.",
              })}
            </div>
          )}

          {patient?._id && patientCreditBalance > 0 && (
            <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 dark:border-emerald-900 dark:bg-emerald-950/30">
              <Label
                htmlFor="settle-use-credit"
                className="-mx-1 flex min-h-11 select-none items-start gap-3 rounded-md px-1 py-1.5 cursor-pointer text-sm font-normal leading-snug active:bg-emerald-100 dark:active:bg-emerald-900/40"
              >
                <Checkbox
                  id="settle-use-credit"
                  checked={settleUseCredit}
                  className="mt-0.5"
                  onCheckedChange={(v) => {
                    const next = v === true;
                    setSettleUseCredit(next);
                    if (next) {
                      const def = Math.min(
                        patientCreditBalance,
                        outstanding,
                      );
                      setSettleCreditAmount(
                        def > 0 ? def.toFixed(2) : "",
                      );
                      if (!settleSplitPayment) {
                        const remaining = Math.max(0, outstanding - def);
                        setSettleAmount(
                          remaining > 0 ? remaining.toFixed(2) : "",
                        );
                      }
                    } else {
                      setSettleCreditAmount("");
                      if (!settleSplitPayment) {
                        setSettleAmount(
                          outstanding > 0 ? outstanding.toFixed(2) : "",
                        );
                      }
                    }
                  }}
                />
                <span>
                  {t("gabinet.payments.useCredit", {
                    defaultValue: "Użyj salda nadpłat",
                    amount: formatCurrencyPLN(patientCreditBalance),
                  })}{" "}
                  <span className="text-muted-foreground">
                    ({formatCurrencyPLN(patientCreditBalance)})
                  </span>
                </span>
              </Label>
              {settleUseCredit && (
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t("gabinet.payments.creditAmountToApply", {
                      defaultValue: "Kwota z salda",
                    })}
                  </Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={settleCreditAmount}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                        setSettleCreditAmount(v);
                      }
                    }}
                    placeholder={Math.min(
                      patientCreditBalance,
                      outstanding,
                    ).toFixed(2)}
                  />
                  {creditApplyExceedsBalance && (
                    <p className="text-[11px] text-destructive">
                      {t("gabinet.payments.creditExceedsBalance", {
                        defaultValue:
                          "Kwota użytego salda nadpłat przekracza dostępne środki.",
                      })}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {!settleSplitPayment && overpaymentAmount > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              {t("gabinet.payments.overpaymentNote", {
                defaultValue:
                  "Nadpłata {{amount}} zostanie dopisana do salda klienta i można ją wykorzystać przy kolejnych wizytach.",
                amount: formatCurrencyPLN(overpaymentAmount),
              })}
            </div>
          )}

          {patient?._id && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="settle-split-payment"
                checked={settleSplitPayment}
                onCheckedChange={(v) => setSettleSplitPayment(v === true)}
              />
              <Label
                htmlFor="settle-split-payment"
                className="cursor-pointer text-sm font-normal"
              >
                {t("gabinet.packages.splitPayment", "Podziel płatność")}
              </Label>
            </div>
          )}

          {settleSplitPayment && (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border p-2 space-y-2">
                  <Label className="text-xs font-medium">
                    {t("gabinet.packages.firstMethod", "Pierwsza metoda")}
                  </Label>
                  <Select
                    value={settleFirstSplitMethod}
                    onValueChange={(v) =>
                      setSettleFirstSplitMethod(
                        v as typeof settleFirstSplitMethod,
                      )
                    }
                  >
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
                      <SelectItem value="package">
                        {t("gabinet.payments.methods.package")}
                      </SelectItem>
                      <SelectItem value="other">
                        {t("gabinet.payments.methods.other")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={settleFirstSplitAmount}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                        setSettleFirstSplitAmount(v);
                      }
                    }}
                  />
                </div>
                <div className="rounded-md border p-2 space-y-2">
                  <Label className="text-xs font-medium">
                    {t("gabinet.packages.secondMethod", "Druga metoda")}
                  </Label>
                  <Select
                    value={settleSecondSplitMethod}
                    onValueChange={(v) =>
                      setSettleSecondSplitMethod(
                        v as typeof settleSecondSplitMethod,
                      )
                    }
                  >
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
                      <SelectItem value="package">
                        {t("gabinet.payments.methods.package")}
                      </SelectItem>
                      <SelectItem value="other">
                        {t("gabinet.payments.methods.other")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={settleSecondSplitAmount}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                        setSettleSecondSplitAmount(v);
                      }
                    }}
                  />
                </div>
              </div>
              <div
                className={cn(
                  "flex items-center justify-between text-xs",
                  splitMismatch || splitSameMethod
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                <span>
                  {t("gabinet.packages.splitSum", "Suma")}:{" "}
                  {formatCurrencyPLN(splitTotal)}
                  {` / ${formatCurrencyPLN(splitExpectedTotal)}`}
                </span>
                {splitSameMethod ? (
                  <span>
                    {t(
                      "gabinet.packages.splitSameMethod",
                      "Metody muszą się różnić",
                    )}
                  </span>
                ) : splitMismatch ? (
                  <span>
                    {t(
                      "gabinet.packages.splitMismatch",
                      "Musi się zgadzać z ceną",
                    )}
                  </span>
                ) : null}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("common.notes")}
            </Label>
            <Textarea
              value={settleNotes}
              onChange={(e) => setSettleNotes(e.target.value)}
              placeholder={t("gabinet.payments.notePlaceholder")}
              className="min-h-[72px] text-sm"
            />
          </div>

          {canMarkCompleted && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                id="settle-mark-completed"
                checked={settleMarkCompleted}
                onCheckedChange={(c) =>
                  setSettleMarkCompleted(c === true)
                }
              />
              <span className="leading-tight">
                {t("gabinet.appointmentDetail.settleMarkCompleted", {
                  defaultValue: "Oznacz wizytę jako zakończoną",
                })}
              </span>
            </label>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleNavigateToPayments}
            disabled={settleSubmitting}
          >
            <ExternalLink className="mr-1 size-3" />
            {t("gabinet.payments.paymentHistory")}
          </Button>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSettleDialogOpen(false)}
              disabled={settleSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleConfirmSettle}
              disabled={
                settleSubmitting ||
                creditApplyExceedsBalance ||
                packageQuantityExceedsRemaining ||
                (settleUsePackage && !settlePackageUsageId) ||
                (settleSplitPayment &&
                  (splitMissingAmount || splitMismatch || splitSameMethod))
              }
            >
              {settleSubmitting
                ? t("common.processing")
                : t("gabinet.appointmentDetail.closeAndSettle", "Rozlicz wizytę")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
