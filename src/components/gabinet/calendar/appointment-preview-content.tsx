import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar,
  Clock,
  Mail,
  Phone,
  Stethoscope,
  User,
} from "@/lib/ez-icons";
import { AlertTriangle, ExternalLink } from "lucide-react";

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending_confirmation: ["scheduled", "confirmed", "cancelled"],
  scheduled: ["confirmed", "cancelled", "no_show"],
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
  const getWarnings = useAction(api.gabinet.appointments.getWarnings);

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

  const [status, setStatus] = useState<AppointmentStatus | "">("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!detail) return;
    const appt = detail.appointment;
    setStatus(appt.status as AppointmentStatus);
    setDate(appt.date);
    setStartTime(appt.startTime.slice(0, 5));
    setEndTime(appt.endTime.slice(0, 5));
    setInternalNotes(appt.internalNotes ?? "");
  }, [detail]);

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
  const availableTransitions = VALID_TRANSITIONS[initialStatus] ?? [];
  const employeeName = employee?.name ?? employee?.email ?? "-";
  const patientFullName = patient
    ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim()
    : "-";

  const dirty =
    status !== initialStatus ||
    date !== appointment.date ||
    startTime !== appointment.startTime.slice(0, 5) ||
    endTime !== appointment.endTime.slice(0, 5) ||
    internalNotes !== (appointment.internalNotes ?? "");

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const args: Parameters<typeof updateAppointment>[0] = {
        organizationId,
        appointmentId: appointment._id as Id<"gabinetAppointments">,
      };
      if (date !== appointment.date) args.date = date;
      if (startTime !== appointment.startTime.slice(0, 5))
        args.startTime = startTime;
      if (endTime !== appointment.endTime.slice(0, 5)) args.endTime = endTime;
      if (status && status !== initialStatus) args.status = status;
      if (internalNotes !== (appointment.internalNotes ?? ""))
        args.internalNotes = internalNotes;

      await updateAppointment(args);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: supabaseKeys.gabinetAppointments.all,
        }),
        queryClient.invalidateQueries({
          queryKey: supabaseKeys.scheduledActivities.all,
        }),
      ]);
      await refetch();
      toast.success(t("gabinet.appointments.updated"));
      onClose();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
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
            {treatment?.name && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                <Stethoscope className="size-3 shrink-0" />
                {treatment.name}
              </p>
            )}
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            <span
              className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT_COLORS[initialStatus] ?? "bg-muted-foreground"}`}
            />
            {t(`gabinet.appointments.statuses.${initialStatus}`)}
          </Badge>
        </div>

        {/* Quick contact links */}
        {(patient?.phone || patient?.email) && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {patient?.phone && (
              <a
                href={`tel:${patient.phone}`}
                className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Phone className="size-3" />
                {patient.phone}
              </a>
            )}
            {patient?.email && (
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
            onValueChange={(v) => setStatus(v as AppointmentStatus)}
            disabled={availableTransitions.length === 0}
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
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-8 w-[88px] text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("common.to", "Do")}
            </Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-8 w-[88px] text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <Clock className="mr-1 inline size-3" />
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
  );
}
