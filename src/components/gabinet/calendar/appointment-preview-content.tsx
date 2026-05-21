import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { supabaseKeys } from "@/lib/supabase/query-keys";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { DocumentGateDialog } from "@/components/documents/document-gate-dialog";
import { useAppointmentDocumentCounts } from "@/components/documents/appointment-document-checklist";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Calendar,
  Mail,
  Phone,
  Stethoscope,
  User,
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
import { useSidebarActions } from "@/components/layout/sidebar-context";

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending_confirmation: ["scheduled", "confirmed", "cancelled"],
  scheduled: ["confirmed", "in_progress", "completed", "cancelled", "no_show"],
  confirmed: ["in_progress", "completed", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

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

  const getFullDetail = useAction(api.gabinet.appointments.getFullDetail);
  const updateAppointment = useAction(api.gabinet.appointments.update);
  const updateStatus = useAction(api.gabinet.appointments.updateStatus);
  const updatePatient = useAction(api.gabinet.patients.update);
  const getWarnings = useAction(api.gabinet.appointments.getWarnings);
  const listActiveTreatments = useAction(api.gabinet.treatments.listActive);

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

  const [status, setStatus] = useState<AppointmentStatus | "">("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

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

  const { tags: tagDefinitions } = useTagDefinitions(organizationId);
  const { dispatch } = useSidebarActions();

  const docCounts = useAppointmentDocumentCounts(appointmentId, organizationId);

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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
          args.internalNotes = internalNotes;
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
    } catch (error: unknown) {
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

  const formatDateLabel = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(i18n.language, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <>
    <div className="space-y-3">
      {/* Header — patient + treatment */}
      <div className="space-y-1.5">
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
                  className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  aria-label={t("gabinet.appointments.selectTreatment")}
                >
                  <Stethoscope className="size-3 shrink-0" />
                  <span className="truncate">
                    {treatmentDisplayName ||
                      t("gabinet.appointments.selectTreatment")}
                  </span>
                  <ChevronsUpDown className="size-3 shrink-0 opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder={t("gabinet.appointments.searchTreatment")}
                    value={treatmentSearch}
                    onValueChange={setTreatmentSearch}
                  />
                  <CommandList>
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
          <Badge variant="outline" className="shrink-0 text-[10px]">
            <span
              className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT_COLORS[initialStatus] ?? "bg-muted-foreground"}`}
            />
            {t(`gabinet.appointments.statuses.${initialStatus}`)}
          </Badge>
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
                {patient.phone}
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
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <User className="size-3" />
          <span className="truncate">{employeeName}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="size-3" />
          <span className="truncate">{formatDateLabel(appointment.date)}</span>
        </div>
      </div>

      <Separator />

      {/* Edit fields */}
      <div className="space-y-2.5">
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("gabinet.appointmentDetail.changeStatus")}
          </Label>
          <Select
            value={status}
            onValueChange={(v) => handleStatusChange(v as AppointmentStatus)}
            disabled={availableTransitions.length === 0 || savingStatus}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={initialStatus} disabled>
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT_COLORS[initialStatus] ?? "bg-muted-foreground"}`}
                  />
                  {t(`gabinet.appointments.statuses.${initialStatus}`)}
                </span>
              </SelectItem>
              {availableTransitions.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="flex items-center gap-2">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT_COLORS[s] ?? "bg-muted-foreground"}`}
                    />
                    {t(`gabinet.appointments.statuses.${s}`)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("gabinet.appointmentDetail.tags", { defaultValue: "Etykiety" })}
            </Label>
            <button
              type="button"
              onClick={() => dispatch("manageTags")}
              className="text-[11px] font-medium text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              {t("gabinet.appointmentDetail.manageTags", {
                defaultValue: "Zarządzaj",
              })}
            </button>
          </div>
          <TagsPicker
            tags={tagDefinitions}
            selectedIds={tagIds}
            onChange={setTagIds}
            placeholder={
              tagDefinitions.length === 0
                ? t("gabinet.appointmentDetail.addFirstTagHint", {
                    defaultValue: 'Dodaj pierwszy tag w "Zarządzaj"',
                  })
                : t("tags.assign", { defaultValue: "Tagi" })
            }
          />
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
              step={900}
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
              step={900}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-8 w-[88px] text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("gabinet.appointments.internalNotes")}
          </Label>
          <Textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            placeholder={t("gabinet.appointments.internalNotesPlaceholder")}
            className="min-h-[60px] text-sm"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
          <Link
            to="/dashboard/gabinet/appointments/$appointmentId"
            params={{ appointmentId: appointment._id }}
          >
            <ExternalLink className="mr-1 size-3" />
            {t("gabinet.appointments.openFullView", "Otwórz pełny widok")}
          </Link>
        </Button>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!dirty || saving}
            onClick={handleSave}
          >
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>
    </div>

    <Dialog
      open={cancelDialogOpen}
      onOpenChange={(o) => {
        setCancelDialogOpen(o);
        if (!o) setCancelReason("");
      }}
    >
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
    </>
  );
}
